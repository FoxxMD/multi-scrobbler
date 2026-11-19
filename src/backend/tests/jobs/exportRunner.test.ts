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
import { COMPONENT_STATE } from '../../../core/Api.ts';
import type { PlayObject } from '../../../core/PlaySchema.ts';
import type { StageConfig } from '../../../core/Transform.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { nameToCredit } from '../../../core/MusicMetadata.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0, exportPoll: 20};

/** Holds every queued play until `process` is called, like a client whose queue never drains on its own */
class FakeClient implements ExportClient {
    componentId: number;
    name = 'fake';
    emitter = new EventEmitter();
    queuedLength = 0;
    running = true;
    queued: PlayObject[] = [];
    transformedWith: StageConfig[][] = [];
    /** emit a failed playUpdate for every queued play */
    failAll = false;
    jobId?: number;

    constructor(componentId: number) {
        this.componentId = componentId;
    }

    getRunningState() {
        return this.running ? COMPONENT_STATE.RUNNING : COMPONENT_STATE.IDLE;
    }

    async queuePlay(data: PlayObject[], _context?: unknown, opts: {jobId?: number} = {}) {
        this.queued.push(...data);
        this.queuedLength += data.length;
        if (this.failAll) {
            for (let i = 0; i < data.length; i++) {
                this.queuedLength--;
                this.emitter.emit('playUpdate', {componentId: this.componentId, data: {jobId: opts.jobId, state: 'failed', error: {message: 'bad auth'}}});
            }
        }
        return data;
    }

    async transformPlay(play: PlayObject, _hook: 'postCompare', opts: {stages?: StageConfig[]}) {
        this.transformedWith.push(opts.stages ?? []);
        return {...play, data: {...play.data, track: nameToCredit(`${play.data.track?.name} (transformed)`)}};
    }

    /** dequeue n plays like the client processed them */
    process(n = this.queuedLength) {
        this.queuedLength -= n;
        this.emitter.emit('playDequeued', {componentId: this.componentId});
    }
}

const setup = async (opts: {db?: DbConcrete, timestamps?: number[], limit?: number, order?: 'asc' | 'desc', rangeTo?: number, coverage?: [number, number][], importing?: boolean, transformOptions?: unknown[], realClient?: ExportClient} = {}) => {
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
        parseStages: async (raw) => raw as StageConfig[],
    };
    const runner = new JobRunner(job.id, deps);
    return {db, mirror, mirrors, jobRepo, job, targetRepo, target, client, locks, runner};
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
