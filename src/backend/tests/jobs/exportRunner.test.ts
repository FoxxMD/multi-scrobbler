import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { EventEmitter } from 'node:events';
import { isAbortError } from 'abort-controller-x';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { JobTargetRepository } from '../../common/database/drizzle/repositories/JobTargetRepository.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { components } from '../../common/database/drizzle/schema/schema.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { componentLockKey, type ExportClient, mirrorLockKey, JobRunner, type JobRunnerDeps } from '../../jobs/JobRunner.ts';
import { LockRegistry } from '../../jobs/LockRegistry.ts';
import type { DbConcrete } from '../../common/database/drizzle/drizzleUtils.ts';
import type { PlayWith } from '../../common/database/drizzle/drizzleTypes.ts';
import { COMPONENT_STATE } from '../../../core/Api.ts';
import type { PlayObject } from '../../../core/PlaySchema.ts';
import type { StageCommon } from '../../../core/Transform.ts';
import type { LifecycleStep } from '../../../core/Atomic.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { BAD_TIMESTAMP_BEFORE_MS, EPOCH_CHECK_MAX } from '../../../core/Job.ts';
import { nameToCredit, namesToCredits } from '../../../core/MusicMetadata.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';
import type { WriteBudget } from '../../common/vendor/atproto/WriteBudget.ts';
import { exportStageSeconds, exportWaitSeconds, playStageSeconds } from '../../common/playMetrics.ts';
import type prom from 'prom-client';

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0, exportPoll: 20};

/** Holds every queued play until `process` is called, like a client whose queue never drains on its own */
class FakeClient implements ExportClient {
    componentId: number;
    name = 'fake';
    emitter = new EventEmitter();
    queuedLength = 0;
    running = true;
    queued: PlayObject[] = [];
    contexts: unknown[] = [];
    /** context each queued play was queued with */
    playContexts: unknown[] = [];
    transformedWith: StageCommon[][] = [];
    /** titles of plays given to queuePlay with transform steps */
    withSteps: (string | undefined)[] = [];
    /** transform steps returned for a play, IE to set a Stage action */
    stepsFor: (play: PlayObject) => LifecycleStep[] = () => [];
    /** emit a failed playUpdate for every queued play */
    failAll = false;
    jobId?: number;
    budget?: WriteBudget;
    ensureCoverage?: ExportClient['ensureCoverage'];
    releaseCoverage?: ExportClient['releaseCoverage'];
    countScrobblesBefore?: ExportClient['countScrobblesBefore'];

    constructor(componentId: number) {
        this.componentId = componentId;
    }

    getSafeExternalName() {
        return this.name;
    }

    getRunningState() {
        return this.running ? COMPONENT_STATE.RUNNING : COMPONENT_STATE.IDLE;
    }

    async queuePlay(data: PlayObject[], context?: unknown, opts: {jobId?: number, steps?: Map<PlayObject, LifecycleStep[]>} = {}) {
        this.withSteps.push(...[...(opts.steps?.keys() ?? [])].map(x => x.data.track?.name));
        this.queued.push(...data);
        this.contexts.push(context);
        this.playContexts.push(...data.map(() => context));
        this.queuedLength += data.length;
        if (this.failAll) {
            for (let i = 0; i < data.length; i++) {
                this.queuedLength--;
                this.emitter.emit('playUpdate', {componentId: this.componentId, data: {jobId: opts.jobId, state: 'failed', error: {message: 'bad auth'}}});
            }
        }
        return data;
    }

    async transformPlay(play: PlayObject, _hook: 'postCompare', opts: {stages?: StageCommon[]}) {
        this.transformedWith.push(opts.stages ?? []);
        return {play: {...play, data: {...play.data, track: nameToCredit(`${play.data.track?.name} (transformed)`)}}, steps: this.stepsFor(play)};
    }

    async writeBudget() {
        return this.budget;
    }

    /** dequeue n plays like the client processed them */
    process(n = this.queuedLength) {
        this.queuedLength -= n;
        this.emitter.emit('playDequeued', {componentId: this.componentId});
    }
}

const setup = async (opts: {db?: DbConcrete, timestamps?: number[], limit?: number, order?: 'asc' | 'desc', rangeTo?: number, coverage?: [number, number][], importing?: boolean, transformOptions?: unknown[], upstreamCheck?: boolean, exportDiscarded?: boolean, skipBad?: boolean, collapse?: boolean, keepEpoch?: boolean, realClient?: ExportClient} = {}) => {
    const db = opts.db ?? await transientDb();
    const mirrors = new MirrorRepository(db);
    const mirror = await mirrors.findOrCreate({userId: null as unknown as string, service: 'lastfm', account: null, name: 'test'});
    for (const c of opts.coverage ?? [[0, 1000]]) {
        await mirrors.addCoverage(mirror.id, c);
    }
    const historical = new DrizzlePlayHistoricalRepository(db);
    await historical.insertIgnoreDuplicates((opts.timestamps ?? [100, 200, 300, 400, 500, 600, 700]).map((ts, i) => ({
        uid: `m${mirror.id}:${ts}:${i}`,
        mirrorId: mirror.id,
        play: generatePlay({playDate: dayjs(ts), track: nameToCredit(`T${ts}${opts.timestamps !== undefined && opts.timestamps.indexOf(ts) !== i ? `-${i}` : ''}`)}),
    })));
    const jobRepo = new JobRepository(db);
    const job = await jobRepo.create({
        name: 'test',
        mirrorId: mirror.id,
        rangeTo: dayjs(opts.rangeTo ?? 1000),
        exportOrder: opts.order ?? 'desc',
        exportQueueLimit: opts.limit ?? 20,
        // a job still importing has something to import from
        importFile: opts.importing === true ? {path: '/nope', originalName: 'x.csv', format: 'lastfm-ghan-csv', size: 1, managed: false} : undefined,
        importStatus: opts.importing === true ? 'running' : 'idle',
        transformOptions: opts.transformOptions,
        exportUpstreamCheck: opts.upstreamCheck,
        exportDiscarded: opts.exportDiscarded,
        exportSkipBadTimestamps: opts.skipBad,
        exportCollapseBursts: opts.collapse,
        exportKeepEpochBursts: opts.keepEpoch,
    });
    const componentId = opts.realClient?.componentId ?? (await db.insert(components).values({type: 'test', name: 'fake', mode: 'client', uid: `fake-${Math.random()}`}).returning())[0].id;
    const targetRepo = new JobTargetRepository(db);
    const [target] = await targetRepo.createForJob(job.id, [componentId]);
    const client = new FakeClient(componentId);
    const locks = new LockRegistry();
    const deps: JobRunnerDeps = {
        db,
        logger: loggerTest,
        locks,
        emitter: new WildcardEmitter(),
        createProvider: () => undefined,
        timings,
        resolveClient: (id) => id === componentId ? (opts.realClient ?? client) : undefined,
        parseStages: async (raw) => raw as StageCommon[],
    };
    const runner = new JobRunner(job.id, deps);
    return {db, mirror, mirrors, historical, jobRepo, job, targetRepo, target, client, locks, runner};
}

const until = async (fn: () => boolean | Promise<boolean>, ms = 2000) => {
    const start = Date.now();
    while (!(await fn())) {
        if (Date.now() - start > ms) {
            throw new Error('timed out');
        }
        await new Promise(r => setTimeout(r, 5));
    }
}

const exportTask = (runner: JobRunner, targetId: number) => (runner as unknown as {exportTasks: Map<number, {promise: Promise<void>}>}).exportTasks.get(targetId)?.promise;

/** stage label values that have a count sample matching `labels` */
const stagesOf = async (metric: prom.Summary<string>, labels: Record<string, string>) => {
    const {values} = await metric.get();
    return new Set(values.filter(x => x.metricName?.endsWith('_count') && x.value > 0 && Object.entries(labels).every(([k, v]) => x.labels[k] === v)).map(x => x.labels.stage));
}

const titles = (plays: PlayObject[]) => plays.map(x => x.data.track?.name);

describe('Job export runner', function () {

    it('exports every mirror play in range, newest first, then completes', async function () {
        const {runner, target, targetRepo, client} = await setup();
        await runner.startExport(target.id);
        await exportTask(runner, target.id);

        const done = (await targetRepo.getById(target.id))!;
        expect(done.status).eq('completed');
        expect(done.exported).eq(7);
        expect(done.cursor).to.deep.eq({playedAt: 100, id: done.cursor!.id});
        expect(titles(client.queued)).to.deep.eq(['T700', 'T600', 'T500', 'T400', 'T300', 'T200', 'T100']);
        // untransformed mirror play is the original, no raw upstream data
        expect(client.queued[0].original?.play?.data.track?.name).eq('T700');
        expect(client.queued[0].original?.data).is.undefined;
        expect(client.queued[0].id).is.undefined;
    });

    it('waits once for a Client that mirrors its own scrobbles to cover the job range, retrying a failed pass', async function () {
        const {runner, target, targetRepo, client} = await setup();
        const calls: unknown[] = [];
        let release!: () => void;
        const holds: unknown[] = [];
        const released: string[] = [];
        client.releaseCoverage = (hold) => released.push(hold);
        client.ensureCoverage = async (ranges, _signal, hold) => {
            calls.push(ranges);
            holds.push(hold);
            if (calls.length === 1) {
                throw new Error('PDS down');
            }
            await new Promise<void>(r => { release = r; });
        };
        await runner.startExport(target.id);
        await until(() => calls.length === 2);
        expect(runner.runtime.exports[target.id]?.waiting).eq('Client is mirroring its scrobbles in the job range for dupe checks');
        expect(client.queued).length(0);
        release();
        await exportTask(runner, target.id);
        expect(calls).eql([[[0, 1000]], [[0, 1000]]]);
        expect((await targetRepo.getById(target.id))!.exported).eq(7);
        // the job's range is held while exporting, released once at the end
        expect(holds).eql([`job-${runner.jobId}-target-${target.id}`, `job-${runner.jobId}-target-${target.id}`]);
        expect(released).eql([`job-${runner.jobId}-target-${target.id}`]);
    });

    it('never puts more than the queue limit in the client queue', async function () {
        const {runner, target, targetRepo, client} = await setup({limit: 1});
        await runner.startExport(target.id);
        await until(() => client.queued.length === 1);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Client queue is full');
        expect(client.queued).length(1);

        client.process();
        await until(() => client.queued.length === 2);
        expect(client.queuedLength).eq(1);
        for (let i = 0; i < 5; i++) {
            client.process();
            await until(() => client.queued.length === 3 + i);
        }
        client.process();
        await exportTask(runner, target.id);
        expect((await targetRepo.getById(target.id))!.status).eq('completed');
    });

    it('refreshes play counts on a timer instead of every page, and always before completing', async function () {
        const {runner, target, targetRepo, client} = await setup({limit: 1});
        (runner as unknown as {timings: {exportStats: number}}).timings.exportStats = 60_000;
        const repo = (runner as unknown as {targetRepo: JobTargetRepository}).targetRepo;
        let counted = 0;
        const playStats = repo.playStats;
        repo.playStats = async (...args) => {
            counted++;
            return playStats(...args);
        };
        await runner.startExport(target.id);
        for (let i = 0; i < 7; i++) {
            await until(() => client.queued.length === i + 1);
            client.process();
        }
        await exportTask(runner, target.id);
        expect((await targetRepo.getById(target.id))!.status).eq('completed');
        // first page, then the completion check. The other 6 pages are inside the stats window
        expect(counted).eq(2);
    });

    it('records timings for export stages and waits', async function () {
        const {runner, target, client, job} = await setup({limit: 1, transformOptions: [{type: 'user'}]});
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Client queue is full');
        for (let i = 0; i < 7; i++) {
            await until(() => client.queued.length === i + 1);
            client.process();
        }
        await exportTask(runner, target.id);
        const labels = {job: String(job.id), name: 'fake'};
        expect([...await stagesOf(exportStageSeconds, labels)]).to.have.members(['page_read', 'job_transform', 'queue_play', 'stats', 'pass']);
        const waits = (await exportWaitSeconds.get()).values.filter(x => x.labels.job === String(job.id));
        expect(waits.find(x => x.labels.reason === 'Client queue is full')?.value).greaterThan(0);
    });

    it('waits while the client rate limit is at the export reserve, and reports the rate limit', async function () {
        const {runner, target, targetRepo, client} = await setup();
        const budget = {limit: 5000, remaining: 900, reserve: 500, exportReserve: 1000, reset: Date.now() + 60_000, policy: '5000;w=3600', at: Date.now()};
        client.budget = budget;
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting?.startsWith('Rate limit reserve for exports reached, 900 of 5,000 points left per hour') === true);
        expect(client.queued).length(0);
        expect(runner.runtime.exports[target.id]?.rateLimit).to.deep.eq({limit: 5000, remaining: 900, reserve: 1000, reset: budget.reset, policy: '5000;w=3600'});

        client.budget = {...budget, remaining: 1001};
        runner.wake();
        await exportTask(runner, target.id);
        expect((await targetRepo.getById(target.id))!.status).eq('completed');
        expect(client.queued).length(7);
    });

    it('fills a large queue limit in one batch', async function () {
        const {runner, target, client} = await setup({limit: 50});
        const queuedOnce = spyQueue(client);
        await runner.startExport(target.id);
        await exportTask(runner, target.id);
        expect(queuedOnce).to.deep.eq([7]);
    });

    it('desc follows the import as coverage grows', async function () {
        const {runner, target, targetRepo, client, mirrors, mirror, jobRepo, job} = await setup({importing: true, coverage: [[450, 1000]]});
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for the import to mirror more scrobbles');
        expect(titles(client.queued)).to.deep.eq(['T700', 'T600', 'T500']);

        await mirrors.addCoverage(mirror.id, [200, 449]);
        runner.wake();
        await until(() => client.queued.length === 6);
        expect(titles(client.queued).slice(3)).to.deep.eq(['T400', 'T300', 'T200']);

        await jobRepo.update(job.id, {importStatus: 'completed'});
        runner.wake();
        await exportTask(runner, target.id);
        expect(titles(client.queued)).length(7);
        expect((await targetRepo.getById(target.id))!.status).eq('completed');
    });

    it('asc waits until the range start is mirrored', async function () {
        const {runner, target, client, mirrors, mirror} = await setup({importing: true, order: 'asc', coverage: [[450, 1000]]});
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for the import to mirror more scrobbles');
        expect(client.queued).length(0);

        await mirrors.addCoverage(mirror.id, [0, 449]);
        runner.wake();
        await until(() => client.queued.length === 7);
        expect(titles(client.queued)).to.deep.eq(['T100', 'T200', 'T300', 'T400', 'T500', 'T600', 'T700']);
        await runner.stopExport(target.id, 'stopped');
    });

    it('pages through plays with the same timestamp without skipping or repeating any', async function () {
        for (const order of ['desc', 'asc'] as const) {
            const {runner, target, client} = await setup({order, limit: 2, timestamps: [100, 200, 200, 200, 200, 300]});
            await runner.startExport(target.id);
            while (client.queued.length < 6) {
                await until(() => client.queuedLength === 2 || client.queued.length === 6);
                client.process();
            }
            await exportTask(runner, target.id);
            const names = titles(client.queued);
            expect(new Set(names).size, order).eq(6);
            expect(names[0], order).eq(order === 'desc' ? 'T300' : 'T100');
        }
    });

    it('keeps a running export running on shutdown so it resumes on boot', async function () {
        const {runner, target, targetRepo, client} = await setup();
        client.running = false;
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Client is not running');
        await runner.shutdown();
        expect(runner.exportsRunning).length(0);
        expect((await targetRepo.getById(target.id))!.status).eq('running');
    });

    it('says when it is waiting on a halted import', async function () {
        const {runner, target, jobRepo, job} = await setup({importing: true, coverage: [[450, 1000]]});
        await jobRepo.update(job.id, {importStatus: 'paused'});
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for the import, which is paused');
        await runner.stopExport(target.id, 'stopped');
    });

    it('waits until a replace import has deleted the old mirror plays', async function () {
        const {runner, target, jobRepo, job, client} = await setup({importing: true});
        await jobRepo.update(job.id, {importOverlap: 'replace'});
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for the import to replace the mirror data in this range');
        expect(client.queued).length(0);
        await jobRepo.update(job.id, {importReplacedAt: dayjs()});
        runner.wake();
        await until(() => client.queued.length > 0);
        await runner.stopExport(target.id, 'stopped');
    });

    it('stops after too many failed scrobbles in a row', async function () {
        const {runner, target, targetRepo, client} = await setup({limit: 1, timestamps: Array.from({length: 15}, (_, i) => (i + 1) * 10)});
        client.failAll = true;
        await runner.startExport(target.id);
        await exportTask(runner, target.id);

        const failed = (await targetRepo.getById(target.id))!;
        expect(failed.status).eq('failed');
        expect(failed.error?.message).to.include('10 failed scrobbles in a row').and.include('bad auth');
        expect(failed.breaker.trippedAt).is.not.undefined;
        expect(client.queued).length(10);
    });

    it('runs job transforms through the target client', async function () {
        const stages = [{type: 'user', name: 'x'}];
        const {runner, target, client} = await setup({transformOptions: stages});
        await runner.startExport(target.id);
        await exportTask(runner, target.id);
        expect(client.transformedWith[0]).to.deep.eq(stages);
        expect(client.queued[0].data.track?.name).eq('T700 (transformed)');
        expect(client.queued[0].original?.play?.data.track?.name).eq('T700');
    });

    describe('data issue options', function () {
        const DAY = 86_400_000;
        /** plays of one track */
        const insertTrack = (historical: DrizzlePlayHistoricalRepository, mirrorId: number, track: string, timestamps: number[]) => historical.insertIgnoreDuplicates(timestamps.map(ts => ({
            uid: `m${mirrorId}:${track}:${ts}`,
            mirrorId,
            play: generatePlay({playDate: dayjs(ts), track: nameToCredit(track), artists: namesToCredits(['A'])}),
        })));

        it('skips plays with a bad timestamp', async function () {
            // imported now, so dated in the future
            const future = Date.now() + 2 * DAY;
            const {runner, target, targetRepo, client} = await setup({timestamps: [100, 200, DAY + 100, DAY + 200, future], rangeTo: future + 1000, coverage: [[0, future + 1000]], skipBad: true});
            await runner.startExport(target.id);
            await exportTask(runner, target.id);
            expect(titles(client.queued)).to.deep.eq([`T${DAY + 200}`, `T${DAY + 100}`]);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 2, skipped: 3});
        });

        for (const order of ['desc', 'asc'] as const) {
            it(`collapses bursts to the first play in ${order} order`, async function () {
                const {runner, target, targetRepo, client, historical, mirror} = await setup({timestamps: [], rangeTo: 30_000, coverage: [[0, 30_000]], collapse: true, order});
                await insertTrack(historical, mirror.id, 'B', [5000, 6000, 7000, 8000, 9000]);
                await insertTrack(historical, mirror.id, 'X', [20_000]);
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(client.queued.map(x => [x.data.track?.name, x.data.playDate?.valueOf()])).to.deep.eq(order === 'desc' ? [['X', 20_000], ['B', 9000]] : [['B', 5000], ['X', 20_000]]);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 2, skipped: 4});
            });
        }

        it('waits for the import to finish before collapsing bursts', async function () {
            const {runner, target, targetRepo, client, jobRepo, job} = await setup({importing: true, collapse: true});
            await runner.startExport(target.id);
            await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for the import to finish, so bursts are complete');
            expect(client.queued).length(0);
            await jobRepo.update(job.id, {importStatus: 'completed'});
            runner.wake();
            await exportTask(runner, target.id);
            expect(client.queued).length(7);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', skipped: 0});
        });

        it('stops a page at the queue limit with skipped plays between kept ones', async function () {
            const {runner, target, targetRepo, client, historical, mirror} = await setup({timestamps: [], rangeTo: 30_000, coverage: [[0, 30_000]], collapse: true, order: 'asc', limit: 2});
            await insertTrack(historical, mirror.id, 'B', [1000, 2000, 3000]);
            await insertTrack(historical, mirror.id, 'X', [10_000]);
            await insertTrack(historical, mirror.id, 'Y', [20_000]);
            await runner.startExport(target.id);
            await until(() => runner.runtime.exports[target.id]?.waiting === 'Client queue is full');
            expect(titles(client.queued)).to.deep.eq(['B', 'X']);
            expect((await targetRepo.getById(target.id))!).to.deep.include({exported: 2, skipped: 2});
            expect((await targetRepo.getById(target.id))!.cursor?.playedAt).eq(10_000);
            client.process();
            await exportTask(runner, target.id);
            expect(titles(client.queued)).to.deep.eq(['B', 'X', 'Y']);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 3, skipped: 2});
        });

        it('keeps the first good play of a burst when bad timestamps are skipped too', async function () {
            const {runner, target, targetRepo, client, historical, mirror} = await setup({timestamps: [], rangeTo: DAY + 10_000, coverage: [[0, DAY + 10_000]], collapse: true, skipBad: true, order: 'asc'});
            await insertTrack(historical, mirror.id, 'B', [DAY - 1000, DAY, DAY + 1000]);
            await runner.startExport(target.id);
            await exportTask(runner, target.id);
            expect(client.queued.map(x => x.data.playDate?.valueOf())).to.deep.eq([DAY]);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 1, skipped: 2});
        });

        it('finds bursts again when the mirror changes mid-export', async function () {
            const {runner, target, targetRepo, client, historical, mirror} = await setup({timestamps: [], rangeTo: 40_000, coverage: [[0, 40_000]], collapse: true, limit: 1});
            await insertTrack(historical, mirror.id, 'X', [30_000]);
            await insertTrack(historical, mirror.id, 'Y', [20_000]);
            await runner.startExport(target.id);
            await until(() => runner.runtime.exports[target.id]?.waiting === 'Client queue is full');
            await insertTrack(historical, mirror.id, 'C', [25_000, 25_500, 26_000]);
            client.process();
            await until(() => client.queued.length === 2);
            client.process();
            await until(() => client.queued.length === 3);
            client.process();
            await exportTask(runner, target.id);
            expect(client.queued.map(x => [x.data.track?.name, x.data.playDate?.valueOf()])).to.deep.eq([['X', 30_000], ['C', 26_000], ['Y', 20_000]]);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', skipped: 2});
        });

        it('applies an option turned on mid-export to the plays not exported yet', async function () {
            const {runner, target, targetRepo, client, jobRepo, job} = await setup({timestamps: [100, 200, DAY + 100, DAY + 200], rangeTo: DAY + 1000, coverage: [[0, DAY + 1000]], limit: 1});
            await runner.startExport(target.id);
            await until(() => runner.runtime.exports[target.id]?.waiting === 'Client queue is full');
            await jobRepo.update(job.id, {exportSkipBadTimestamps: true});
            client.process();
            await until(() => client.queued.length === 2);
            client.process();
            await exportTask(runner, target.id);
            expect(titles(client.queued)).to.deep.eq([`T${DAY + 200}`, `T${DAY + 100}`]);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 2, skipped: 2});
        });

        it('says when collapsing bursts waits on a halted import', async function () {
            const {runner, target, jobRepo, job} = await setup({importing: true, collapse: true});
            await jobRepo.update(job.id, {importStatus: 'failed'});
            await runner.startExport(target.id);
            await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for the import to finish, so bursts are complete. The import is failed');
            await runner.stopExport(target.id, 'stopped');
        });

        it('reads past many skipped plays in few passes, never over the queue limit', async function () {
            const bad = Array.from({length: 600}, (_, i) => i * 10);
            const {runner, target, targetRepo, client} = await setup({timestamps: [...bad, DAY + 100, DAY + 200], rangeTo: DAY + 1000, coverage: [[0, DAY + 1000]], order: 'asc', limit: 1, skipBad: true});
            const repo = (runner as unknown as {historicalRepo: DrizzlePlayHistoricalRepository}).historicalRepo;
            const read = repo.findPageForExport;
            let reads = 0;
            repo.findPageForExport = (args) => {
                reads++;
                return read(args);
            };
            await runner.startExport(target.id);
            await until(() => client.queued.length === 1);
            await until(() => runner.runtime.exports[target.id]?.waiting === 'Client queue is full');
            expect(client.queuedLength).eq(1);
            client.process();
            await until(() => client.queued.length === 2);
            client.process();
            await exportTask(runner, target.id);
            expect(titles(client.queued)).to.deep.eq([`T${DAY + 100}`, `T${DAY + 200}`]);
            expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 2, skipped: 600});
            expect(reads).lessThan(10);
        });

        describe('keeping onboarding bursts', function () {
            const RANGE = DAY + 30_000;
            /** an onboarding burst B, a single Epoch Play S and a burst C after the cutoff */
            const epochSetup = async (opts: Parameters<typeof setup>[0] & {found?: number} = {}) => {
                const ctx = await setup({timestamps: [], rangeTo: RANGE, coverage: [[0, RANGE]], collapse: true, keepEpoch: true, order: 'asc', ...opts});
                await insertTrack(ctx.historical, ctx.mirror.id, 'B', [1000, 2000, 3000, 4000, 5000]);
                await insertTrack(ctx.historical, ctx.mirror.id, 'S', [50_000]);
                await insertTrack(ctx.historical, ctx.mirror.id, 'C', [DAY + 5000, DAY + 6000, DAY + 7000]);
                let checks = 0;
                ctx.client.countScrobblesBefore = async (ms, max) => {
                    checks++;
                    expect(ms).eq(BAD_TIMESTAMP_BEFORE_MS);
                    return Math.min(opts.found ?? 0, max);
                };
                return {...ctx, checks: () => checks};
            }
            /** [title, dupeCheck] of each queued play */
            const sent = (client: FakeClient) => client.queued.map((x, i) => [x.data.track?.name, (client.playContexts[i] as {dupeCheck?: boolean} | undefined)?.dupeCheck]);

            for (const order of ['asc', 'desc'] as const) {
                it(`sends Epoch Plays without a dupe check to a Client without any, in ${order} order`, async function () {
                    const {runner, target, targetRepo, client, checks} = await epochSetup({order});
                    await runner.startExport(target.id);
                    await exportTask(runner, target.id);
                    const epoch = [...Array(5).fill(['B', false]), ['S', false]];
                    expect(sent(client)).to.deep.eq(order === 'asc' ? [...epoch, ['C', undefined]] : [['C', undefined], ...epoch.reverse()]);
                    expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 7, skipped: 2, epochDecision: 'empty'});
                    expect(checks()).eq(1);
                });
            }

            it('waits for a decision when the Client has scrobbles before 2 Jan 1970, then sends them', async function () {
                const {runner, target, targetRepo, client} = await epochSetup({found: 3});
                await runner.startExport(target.id);
                await until(() => runner.runtime.exports[target.id]?.epochPlays === 3);
                expect(runner.runtime.exports[target.id]?.waiting).match(/already has 3 scrobbles before 2 Jan 1970/);
                expect(client.queued).length(0);
                expect((await targetRepo.getById(target.id))!.cursor).is.null;
                await targetRepo.update(target.id, {epochDecision: 'send'});
                runner.wake();
                await exportTask(runner, target.id);
                expect(sent(client)).to.deep.eq([...Array(5).fill(['B', false]), ['S', false], ['C', undefined]]);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 7, epochDecision: 'send'});
            });

            it('skips Epoch Plays when the user decided so', async function () {
                const {runner, target, targetRepo, client} = await epochSetup({found: 500});
                await runner.startExport(target.id);
                await until(() => runner.runtime.exports[target.id]?.epochPlays === EPOCH_CHECK_MAX);
                expect(runner.runtime.exports[target.id]?.waiting).match(new RegExp(`already has ${EPOCH_CHECK_MAX}\\+ scrobbles`));
                await targetRepo.update(target.id, {epochDecision: 'skip'});
                runner.wake();
                await exportTask(runner, target.id);
                expect(sent(client)).to.deep.eq([['C', undefined]]);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 1, skipped: 8});
            });

            it('waits for a decision when the Client cannot check', async function () {
                const {runner, target, client} = await epochSetup();
                client.countScrobblesBefore = undefined;
                await runner.startExport(target.id);
                await until(() => runner.runtime.exports[target.id]?.epochPlays === null);
                expect(runner.runtime.exports[target.id]?.waiting).match(/can't check/);
                await runner.stopExport(target.id, 'stopped');
            });

            it('tries the check again after it fails, and offers a decision meanwhile', async function () {
                const {runner, target, targetRepo, client} = await epochSetup();
                let fail = true;
                client.countScrobblesBefore = async () => {
                    if (fail) {
                        throw new Error('down');
                    }
                    return 0;
                };
                await runner.startExport(target.id);
                await until(() => runner.runtime.exports[target.id]?.waiting?.startsWith('Could not check') === true);
                expect(runner.runtime.exports[target.id]?.epochPlays).null;
                fail = false;
                await exportTask(runner, target.id);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', epochDecision: 'empty'});
            });

            it('checks once while waiting for a decision', async function () {
                const {runner, target, targetRepo, client, checks} = await epochSetup({found: 3});
                await runner.startExport(target.id);
                await until(() => runner.runtime.exports[target.id]?.epochPlays === 3);
                // several polls
                await new Promise(r => setTimeout(r, timings.exportPoll * 5));
                expect(checks()).eq(1);
                await targetRepo.update(target.id, {epochDecision: 'send'});
                runner.wake();
                await exportTask(runner, target.id);
                expect(client.queued).length(7);
                expect(checks()).eq(1);
            });

            it("keeps the user's decision made while the check ran", async function () {
                const {runner, target, targetRepo, client} = await epochSetup();
                client.countScrobblesBefore = async () => {
                    await targetRepo.setEpochDecisionIfUnset(target.id, 'skip');
                    return 0;
                };
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(titles(client.queued)).to.deep.eq(['C']);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', epochDecision: 'skip'});
            });

            it('sends transformed Epoch Plays without a dupe check, and none that were discarded', async function () {
                const {runner, target, client} = await epochSetup({transformOptions: [{type: 'user', name: 'x'}]});
                const step = (actionResult: LifecycleStep['actionResult']): LifecycleStep => ({stageName: 'x', stageType: 'user', hook: 'postCompare', source: 'test', actionResult, createdAt: dayjs().toISOString()});
                client.stepsFor = (p) => p.data.playDate?.valueOf() === 2000 ? [step('discard')] : [];
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(sent(client)).to.deep.eq([...Array(4).fill(['B (transformed)', false]), ['S (transformed)', false], ['C (transformed)', undefined]]);
            });

            it('keeps onboarding bursts newest first with bad timestamps skipped', async function () {
                const {runner, target, targetRepo, client} = await epochSetup({skipBad: true, order: 'desc'});
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(sent(client)).to.deep.eq([['C', undefined], ...Array(5).fill(['B', false])]);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 6, skipped: 3});
            });

            it('does not check again after a decision', async function () {
                const {runner, target, targetRepo, client, checks} = await epochSetup({found: 3});
                await targetRepo.update(target.id, {epochDecision: 'send'});
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(client.queued).length(7);
                expect(checks()).eq(0);
            });

            it('keeps onboarding bursts when bad timestamps are skipped, and keeps the upstream check option', async function () {
                const {runner, target, targetRepo, client} = await epochSetup({skipBad: true, upstreamCheck: false});
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(titles(client.queued)).to.deep.eq([...Array(5).fill('B'), 'C']);
                expect(client.playContexts).to.deep.eq([...Array(5).fill({upstreamCheck: false, dupeCheck: false}), {upstreamCheck: false}]);
                expect((await targetRepo.getById(target.id))!).to.include({status: 'completed', exported: 6, skipped: 3});
            });

            it('collapses onboarding bursts without the option', async function () {
                const {runner, target, client, jobRepo, job, checks} = await epochSetup();
                await jobRepo.update(job.id, {exportKeepEpochBursts: false});
                await runner.startExport(target.id);
                await exportTask(runner, target.id);
                expect(sent(client)).to.deep.eq([['B', undefined], ['S', undefined], ['C', undefined]]);
                expect(checks()).eq(0);
            });
        });
    });

    it('does not send plays that a job transform discarded', async function () {
        const {runner, target, targetRepo, client} = await setup({transformOptions: [{type: 'user', name: 'x'}]});
        const step = (actionResult: LifecycleStep['actionResult']): LifecycleStep => ({stageName: 'x', stageType: 'user', hook: 'postCompare', source: 'test', actionResult, createdAt: dayjs().toISOString()});
        // a later approve negates an earlier discard
        client.stepsFor = (p) => p.data.track?.name === 'T700' ? [step('discard')] : p.data.track?.name === 'T600' ? [step('discard'), step('approve')] : [];
        await runner.startExport(target.id);
        await exportTask(runner, target.id);

        const done = (await targetRepo.getById(target.id))!;
        expect(done.status).eq('completed');
        expect(titles(client.queued)).to.deep.eq(['T600', 'T500', 'T400', 'T300', 'T200', 'T100'].map(x => `${x} (transformed)`));
    });

    it('sends plays that a job transform discarded, with their steps, when the job keeps discarded plays', async function () {
        const {runner, target, client} = await setup({transformOptions: [{type: 'user', name: 'x'}], exportDiscarded: true});
        client.stepsFor = (p) => p.data.track?.name === 'T700' ? [{stageName: 'x', stageType: 'user', hook: 'postCompare', source: 'test', actionResult: 'discard', createdAt: dayjs().toISOString()}] : [];
        await runner.startExport(target.id);
        await exportTask(runner, target.id);
        expect(client.queued).length(7);
        expect(client.withSteps).to.deep.eq(['T700 (transformed)']);
    });

    it('gives the client the job transform steps of each play', async function () {
        const {runner, target, client} = await setup({transformOptions: [{type: 'user', name: 'x'}]});
        const step = (actionResult: LifecycleStep['actionResult']): LifecycleStep => ({stageName: 'x', stageType: 'user', hook: 'postCompare', source: 'test', actionResult, createdAt: dayjs().toISOString()});
        client.stepsFor = (p) => p.data.track?.name === 'T700' ? [step('review')] : p.data.track?.name === 'T600' ? [step('review'), step('approve')] : [];
        await runner.startExport(target.id);
        await exportTask(runner, target.id);
        expect(client.queued).length(7);
        // plays without steps (no Stage ran) have no transform event to save
        expect(client.withSteps).to.deep.eq(['T700 (transformed)', 'T600 (transformed)']);
    });

    it('tells the client to skip its upstream dupe check only when the job opts out', async function () {
        const checked = await setup();
        await checked.runner.startExport(checked.target.id);
        await exportTask(checked.runner, checked.target.id);
        expect(checked.client.contexts[0]).is.undefined;

        const skipped = await setup({upstreamCheck: false});
        await skipped.runner.startExport(skipped.target.id);
        await exportTask(skipped.runner, skipped.target.id);
        expect(skipped.client.contexts[0]).to.deep.eq({upstreamCheck: false});
    });

    it('counts plays a cleanup deleted in the completed stats', async function () {
        const {runner, target, targetRepo} = await setup();
        await targetRepo.update(target.id, {removedStats: {scrobbled: 5}});
        await runner.startExport(target.id);
        await exportTask(runner, target.id);
        // the fake client creates no plays, so only the removed ones count
        expect((await targetRepo.getById(target.id))!.stats).to.deep.eq({scrobbled: 5});
    });

    it('waits while a cleanup holds the client lock', async function () {
        const {runner, target, client, locks} = await setup();
        locks.tryAcquire(componentLockKey(client.componentId), 'cleanup');
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for a cleanup to finish');
        expect(client.queued).length(0);
        locks.release(componentLockKey(client.componentId), 'cleanup');
        await exportTask(runner, target.id);
        expect(client.queued).length(7);
    });

    it('waits while a cleanup holds the mirror lock', async function () {
        const {runner, target, client, locks, mirror} = await setup();
        locks.tryAcquire(mirrorLockKey(mirror.id), 'cleanup');
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Waiting for a cleanup to finish');
        expect(client.queued).length(0);
        locks.release(mirrorLockKey(mirror.id), 'cleanup');
        await exportTask(runner, target.id);
        expect(client.queued).length(7);
    });

    it('waits while the client is not running', async function () {
        const {runner, target, client} = await setup();
        client.running = false;
        await runner.startExport(target.id);
        await until(() => runner.runtime.exports[target.id]?.waiting === 'Client is not running');
        client.running = true;
        await exportTask(runner, target.id);
        expect(client.queued).length(7);
    });

    it('resumes from its cursor after a pause', async function () {
        const {runner, target, targetRepo, client} = await setup({limit: 3});
        await runner.startExport(target.id);
        await until(() => client.queued.length === 3);
        await runner.stopExport(target.id, 'paused');
        const paused = (await targetRepo.getById(target.id))!;
        expect(paused.status).eq('paused');
        expect(paused.exported).eq(3);

        client.process();
        await runner.startExport(target.id);
        await until(() => client.queued.length === 6);
        client.process();
        await until(() => client.queued.length === 7);
        client.process();
        await exportTask(runner, target.id);
        expect(titles(client.queued)).to.deep.eq(['T700', 'T600', 'T500', 'T400', 'T300', 'T200', 'T100']);
    });

    it('scrobbles through a real client and snapshots play states on completion', async function () {
        const scrobbler = new TestScrobbler();
        await scrobbler.initialize();
        scrobbler.scrobbleSleep = 50;
        scrobbler.scrobbleDelay = 0;
        scrobbler.initScrobbleMonitoring().catch((e) => {
            if (!isAbortError(e)) {
                console.error(e);
            }
        });
        try {
            const now = dayjs().subtract(1, 'day').valueOf();
            const {runner, target, targetRepo, job} = await setup({db: scrobbler.playRepoTest.db, timestamps: [now - 600000, now - 300000, now], rangeTo: now + 1000, coverage: [[0, now + 1000]], realClient: scrobbler as unknown as ExportClient});

            await runner.startExport(target.id);
            await exportTask(runner, target.id);
            const done = (await targetRepo.getById(target.id))!;
            expect(done.status).eq('completed');
            expect(done.queued).eq(3);
            expect(done.stats).to.deep.eq({scrobbled: 3});
            const plays = await scrobbler.playRepoTest.findPlays({jobId: job.id});
            expect(plays.every(x => x.parentId === null && x.play.meta.jobId === job.id)).is.true;
            const stages = await stagesOf(playStageSeconds, {mode: 'client', job: String(job.id)});
            expect([...stages]).to.include.members(['pre_queue_check', 'queue_wait', 'process_total', 'transform', 'dupe_check', 'scrobble_request', 'persist']);
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('creates plays a job transform set for review in review, without processing them', async function () {
        const scrobbler = new TestScrobbler();
        await scrobbler.initialize();
        scrobbler.scrobbleSleep = 50;
        scrobbler.scrobbleDelay = 0;
        scrobbler.initScrobbleMonitoring().catch((e) => {
            if (!isAbortError(e)) {
                console.error(e);
            }
        });
        try {
            const now = dayjs().subtract(1, 'day').valueOf();
            const tm = (scrobbler as unknown as {transformManager: {parseTransformerConfig: (x: unknown) => Promise<StageCommon>}}).transformManager;
            const stages = [await tm.parseTransformerConfig({type: 'match', title: `T${now}`, onSuccessAction: 'review'})];
            const {runner, target, targetRepo, job} = await setup({db: scrobbler.playRepoTest.db, timestamps: [now - 600000, now - 300000, now], rangeTo: now + 1000, coverage: [[0, now + 1000]], realClient: scrobbler as unknown as ExportClient, transformOptions: stages});

            await runner.startExport(target.id);
            await exportTask(runner, target.id);
            const done = (await targetRepo.getById(target.id))!;
            expect(done.status).eq('completed');
            expect(done.queued).eq(3);
            expect(done.stats).to.deep.eq({scrobbled: 2, review: 1});

            const [reviewed] = await scrobbler.playRepoTest.findPlays({jobId: job.id, state: ['review'], with: ['queues', 'events']}) as PlayWith<'queueStates' | 'events'>[];
            expect(reviewed.play.data.track?.name).eq(`T${now}`);
            expect(reviewed.queueStates).length(0);
            expect(reviewed.events.map(x => x.eventName)).to.include.members(['transform', 'playStateChange']);
            // queued plays keep the job's transform steps too
            const scrobbled = await scrobbler.playRepoTest.findPlays({jobId: job.id, state: ['scrobbled'], with: ['events']}) as PlayWith<'events'>[];
            expect(scrobbled).length(2);
            for (const p of scrobbled) {
                const jobTransform = p.events.find(x => x.eventName === 'transform' && (x.data as LifecycleStep[]).some(y => y.stageType === 'match'));
                expect(jobTransform).to.not.be.undefined;
            }

            // exporting the same play again finds the play in review
            const again = await scrobbler.queuePlay([reviewed.play], undefined, {jobId: job.id});
            expect(again).length(0);
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('creates plays a job transform discarded in the discarded state when the job keeps them', async function () {
        const scrobbler = new TestScrobbler();
        await scrobbler.initialize();
        scrobbler.scrobbleSleep = 50;
        scrobbler.scrobbleDelay = 0;
        scrobbler.initScrobbleMonitoring().catch((e) => {
            if (!isAbortError(e)) {
                console.error(e);
            }
        });
        try {
            const now = dayjs().subtract(1, 'day').valueOf();
            const tm = (scrobbler as unknown as {transformManager: {parseTransformerConfig: (x: unknown) => Promise<StageCommon>}}).transformManager;
            const stages = [await tm.parseTransformerConfig({type: 'match', title: `T${now}`, onSuccessAction: 'discard'})];
            const {runner, target, targetRepo, job} = await setup({db: scrobbler.playRepoTest.db, timestamps: [now - 600000, now - 300000, now], rangeTo: now + 1000, coverage: [[0, now + 1000]], realClient: scrobbler as unknown as ExportClient, transformOptions: stages, exportDiscarded: true});

            await runner.startExport(target.id);
            await exportTask(runner, target.id);
            const done = (await targetRepo.getById(target.id))!;
            expect(done.status).eq('completed');
            expect(done.queued).eq(3);
            expect(done.stats).to.deep.eq({scrobbled: 2, discarded: 1});

            const [discarded] = await scrobbler.playRepoTest.findPlays({jobId: job.id, state: ['discarded'], with: ['queues', 'events']}) as PlayWith<'queueStates' | 'events'>[];
            expect(discarded.play.data.track?.name).eq(`T${now}`);
            expect(discarded.queueStates).length(0);
            expect(discarded.events.map(x => x.eventName)).to.include.members(['transform', 'playStateChange']);
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });
});

const spyQueue = (client: FakeClient) => {
    const sizes: number[] = [];
    const orig = client.queuePlay.bind(client);
    client.queuePlay = async (data, ctx, opts) => {
        sizes.push(data.length);
        return orig(data, ctx, opts);
    };
    return sizes;
}
