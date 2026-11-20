import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { historicalPlayInputs, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { JobConflictError, JobRunner, type JobRunnerDeps } from '../../jobs/JobRunner.ts';
import { LockRegistry } from '../../jobs/LockRegistry.ts';
import type { ImportProvider } from '../../jobs/ImportProvider.ts';
import { FakeTimeProvider } from './fakes.ts';
import { MirrorService } from '../../jobs/MirrorService.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import type { ImportBatch } from '../../jobs/ImportProvider.ts';
import type { TimeRange } from '../../utils/RangeUtils.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import type { JobImportOverlap } from '../../../core/Job.ts';
import type { DbConcrete } from '../../common/database/drizzle/drizzleUtils.ts';

const timings = {importPageDelay: 0, importRetries: 2, importRetryBase: 1, readyTimeout: 30, readyPoll: 5, emitThrottle: 0};

const setup = async (opts: {provider?: ImportProvider, persistInputs?: boolean, rangeFrom?: number, rangeTo?: number, coverage?: [number, number][], overlap?: JobImportOverlap, replaceConflicts?: string[], cleanupBatchSize?: number} = {}) => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const mirrors = new MirrorRepository(db);
    const mirror = await mirrors.findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
    for (const c of opts.coverage ?? []) {
        await mirrors.addCoverage(mirror.id, c);
    }
    const jobs = new JobRepository(db);
    const job = await jobs.create({
        userId: owner.id,
        name: 'test',
        mirrorId: mirror.id,
        rangeFrom: opts.rangeFrom !== undefined ? dayjs(opts.rangeFrom) : undefined,
        rangeTo: dayjs(opts.rangeTo ?? 1000),
        persistInputs: opts.persistInputs ?? true,
        componentFromId: undefined,
        importOverlap: opts.overlap ?? 'skip',
    });
    const locks = new LockRegistry();
    const emitter = new WildcardEmitter();
    const mirrorService = new MirrorService({db, logger: loggerTest, locks, emitter, isJobActive: () => false, batchSize: opts.cleanupBatchSize});
    const deps = (provider: ImportProvider | undefined): JobRunnerDeps => ({
        db, logger: loggerTest, locks, emitter, createProvider: () => provider, timings,
        replaceConflicts: async () => opts.replaceConflicts ?? [],
        deleteMirrorRange: async (mirrorId, range, holder, signal) => (await mirrorService.startCleanup(mirrorId, {action: 'delete', range, holder, signal})).done,
    });
    return {db, owner, mirror, mirrors, jobs, job, locks, deps, emitter};
}

const count = async (db: DbConcrete) => (await db.select().from(playsHistorical)).length;

const runToEnd = async (runner: JobRunner) => {
    await runner.startImport();
    // @ts-expect-error reading protected task for test
    await runner.importTask?.promise;
}

describe('Job import runner', function () {

    it('imports every record in range and marks the range covered', async function () {
        const provider = new FakeTimeProvider([100, 200, 300, 400, 500, 600, 700]);
        const {db, mirrors, mirror, jobs, job, deps} = await setup();
        const runner = new JobRunner(job.id, deps(provider));
        await runToEnd(runner);

        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('completed');
        expect(done.imported).eq(7);
        expect(done.importTotal).eq(7);
        expect(await count(db)).eq(7);
        expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([[0, 1000]]);
    });

    it('only fetches gaps not already covered', async function () {
        const provider = new FakeTimeProvider([100, 200, 300, 400, 500, 600, 700]);
        const {db, job, deps} = await setup({coverage: [[250, 650]]});
        const runner = new JobRunner(job.id, deps(provider));
        await runToEnd(runner);

        for (const f of provider.fetches) {
            expect(f.gap![1] < 250 || f.gap![0] > 650).is.true;
        }
        expect(await count(db)).eq(3);
    });

    it('does nothing when the range is already covered', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        const {job, jobs, deps} = await setup({coverage: [[0, 1000]]});
        await runToEnd(new JobRunner(job.id, deps(provider)));
        expect(provider.fetches).length(0);
        expect((await jobs.getById(job.id))!.importStatus).eq('completed');
    });

    it('resumes after pause without duplicates or double counting the total', async function () {
        const provider = new FakeTimeProvider([100, 200, 300, 400, 500, 600, 700, 800, 900], 2);
        const {db, jobs, job, mirrors, mirror, deps} = await setup();
        const runner = new JobRunner(job.id, deps(provider));
        provider.onFetch = async (n) => {
            if (n === 3) {
                // pause while the third page is in flight
                void runner.stopImport('paused');
            }
        };
        await runToEnd(runner);
        const paused = (await jobs.getById(job.id))!;
        expect(paused.importStatus).eq('paused');
        expect(paused.imported).lt(9);

        provider.onFetch = undefined;
        await runToEnd(runner);

        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('completed');
        expect(await count(db)).eq(9);
        expect(done.imported).eq(9);
        expect(done.importTotal).eq(9);
        expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([[0, 1000]]);
    });

    it('retries failed fetches', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        provider.failNext = 2;
        const {jobs, job, deps} = await setup();
        await runToEnd(new JobRunner(job.id, deps(provider)));
        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('completed');
        expect(done.imported).eq(2);
    });

    it('fails with error after retries are exhausted', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        provider.failNext = 100;
        const {jobs, job, deps} = await setup();
        await runToEnd(new JobRunner(job.id, deps(provider)));
        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('failed');
        expect(done.importError?.message).to.include('upstream exploded');
    });

    it('fails when the import source never becomes ready', async function () {
        const provider = new FakeTimeProvider([100]);
        provider.readyError = new Error('not authenticated');
        const {jobs, job, deps} = await setup();
        await runToEnd(new JobRunner(job.id, deps(provider)));
        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('failed');
        expect(provider.fetches).length(0);
    });

    it('allows only one import per mirror at a time', async function () {
        const provider = new FakeTimeProvider([100, 200, 300, 400], 1);
        const {jobs, job, owner, mirror, deps} = await setup();
        const other = await jobs.create({userId: owner.id, name: 'other', mirrorId: mirror.id, rangeTo: dayjs(1000)});

        let release!: () => void;
        const blocked = new Promise<void>(r => { release = r; });
        provider.onFetch = () => blocked;

        const first = new JobRunner(job.id, deps(provider));
        await first.startImport();
        let err: unknown;
        try {
            await new JobRunner(other.id, deps(new FakeTimeProvider([]))).startImport();
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(JobConflictError);
        release();
        // @ts-expect-error reading protected task for test
        await first.importTask?.promise;
    });

    it('fails instead of looping forever when the provider makes no progress', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        provider.fetch = async (args) => ({records: [], cursor: args.cursor!, done: false});
        const {jobs, job, deps} = await setup();
        await runToEnd(new JobRunner(job.id, deps(provider)));
        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('failed');
        expect(done.importError?.message).to.include('no progress');
    });

    it('runs only one import when started twice concurrently', async function () {
        const provider = new FakeTimeProvider([100, 200, 300, 400], 2);
        const {db, jobs, job, deps} = await setup();
        const runner = new JobRunner(job.id, deps(provider));
        await Promise.all([runner.startImport(), runner.startImport()]);
        // @ts-expect-error reading protected task for test
        await runner.importTask?.promise;
        expect(provider.fetches).length(2);
        expect(await count(db)).eq(4);
        expect((await jobs.getById(job.id))!.imported).eq(4);
    });

    it('a stop during startup halts before fetching', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        const {jobs, job, deps} = await setup();
        const runner = new JobRunner(job.id, deps(provider));
        const starting = runner.startImport();
        await runner.stopImport('paused');
        await starting;
        expect(provider.fetches).length(0);
        expect((await jobs.getById(job.id))!.importStatus).eq('paused');
        expect(runner.importRunning).is.false;
    });

    it('keeps running status on shutdown so it can resume', async function () {
        const provider = new FakeTimeProvider([100, 200, 300], 1);
        const {jobs, job, deps} = await setup();
        const runner = new JobRunner(job.id, deps(provider));
        provider.onFetch = (n) => { if (n === 2) { void runner.shutdown(); } };
        await runToEnd(runner);
        expect((await jobs.getById(job.id))!.importStatus).eq('running');
    });

    it('does not store raw inputs when persistInputs is false', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        const {db, job, deps} = await setup({persistInputs: false});
        await runToEnd(new JobRunner(job.id, deps(provider)));
        expect(await count(db)).eq(2);
        expect(await db.select().from(historicalPlayInputs)).length(0);
    });

    it('stores raw inputs when persistInputs is true', async function () {
        const provider = new FakeTimeProvider([100, 200]);
        const {db, job, deps} = await setup();
        await runToEnd(new JobRunner(job.id, deps(provider)));
        const inputs = await db.select().from(historicalPlayInputs);
        expect(inputs).length(2);
        const rows = await db.select().from(playsHistorical);
        expect(rows.every(x => x.play.original === undefined)).is.true;
    });

    it('completes immediately for a mirror-only job', async function () {
        const {jobs, job, deps} = await setup();
        await new JobRunner(job.id, deps(undefined)).startImport();
        expect((await jobs.getById(job.id))!.importStatus).eq('completed');
    });

    describe('origins and overlap', function () {

        /** Mirror rows created outside the job, IE by an earlier import from another origin */
        const seedRows = async (db: DbConcrete, mirrorId: number, timestamps: number[]) => {
            await new DrizzlePlayHistoricalRepository(db).insertIgnoreDuplicates(timestamps.map(ts => ({
                uid: `m${mirrorId}:old:${ts}`,
                mirrorId,
                origin: 'old',
                play: generatePlay({playDate: dayjs(ts)}),
            })));
        }

        /** Streams its records in one batch like a file */
        class FakeFileProvider implements ImportProvider {
            kind = 'fake-file';
            origin = 'fake-file';
            gapDriven = false;
            timestamps: number[];
            constructor(timestamps: number[]) {
                this.timestamps = timestamps;
            }
            async ready() {}
            async fetch(): Promise<ImportBatch> {
                const records = this.timestamps.map(ts => ({key: `file:${ts}`, play: generatePlay({playDate: dayjs(ts)})}));
                const covered: TimeRange = [Math.min(...this.timestamps), Math.max(...this.timestamps)];
                return {records, covered, cursor: {records: records.length}, done: true};
            }
        }

        it('stores the origin on rows and tags coverage with origin and job', async function () {
            const provider = new FakeTimeProvider([100, 200]);
            const {db, mirrors, mirror, job, deps} = await setup();
            await runToEnd(new JobRunner(job.id, deps(provider)));
            const rows = await db.select().from(playsHistorical);
            expect(rows.every(x => x.origin === 'fake')).is.true;
            expect((await mirrors.getById(mirror.id))!.segments).to.deep.eq([{range: [0, 1000], origin: 'fake', jobId: job.id}]);
        });

        it('skip: a file import drops records in time the mirror already covers', async function () {
            const {db, job, jobs, deps} = await setup({coverage: [[150, 450]]});
            await runToEnd(new JobRunner(job.id, deps(new FakeFileProvider([100, 200, 300, 500]))));
            const rows = await db.select().from(playsHistorical);
            expect(rows.map(x => x.playedAt!.valueOf()).sort((a, b) => a - b)).to.deep.eq([100, 500]);
            const done = (await jobs.getById(job.id))!;
            expect(done.imported).eq(2);
            expect(done.importFetched).eq(4);
        });

        it('replace: deletes mirror plays in the exact job range, then imports all of it', async function () {
            const {db, mirrors, mirror, job, jobs, deps} = await setup({overlap: 'replace', rangeFrom: 200, rangeTo: 600, coverage: [[0, 1000]]});
            await seedRows(db, mirror.id, [100, 200, 400, 600, 700]);
            await runToEnd(new JobRunner(job.id, deps(new FakeTimeProvider([300, 500]))));

            const rows = await db.select().from(playsHistorical);
            expect(rows.map(x => [x.playedAt!.valueOf(), x.origin]).sort((a, b) => (a[0] as number) - (b[0] as number))).to.deep.eq([
                [100, 'old'], [300, 'fake'], [500, 'fake'], [700, 'old'],
            ]);
            const done = (await jobs.getById(job.id))!;
            expect(done.importStatus).eq('completed');
            expect(done.importReplacedAt).not.null;
            const m = (await mirrors.getById(mirror.id))!;
            expect(m.coverage).to.deep.eq([[0, 1000]]);
            expect(m.segments).to.deep.eq([
                {range: [0, 199], origin: 'unknown', jobId: null},
                {range: [200, 600], origin: 'fake', jobId: job.id},
                {range: [601, 1000], origin: 'unknown', jobId: null},
            ]);
        });

        it('replace: a resumed import does not delete again', async function () {
            const {db, mirror, job, jobs, deps} = await setup({overlap: 'replace', rangeFrom: 200, rangeTo: 600});
            await jobs.update(job.id, {importReplacedAt: dayjs()});
            await seedRows(db, mirror.id, [400]);
            await runToEnd(new JobRunner(job.id, deps(new FakeTimeProvider([300]))));
            expect((await db.select().from(playsHistorical)).map(x => x.playedAt!.valueOf()).sort()).to.deep.eq([300, 400]);
        });

        it('replace: a stop during the delete halts and a resume finishes the replace', async function () {
            const {db, mirror, job, jobs, deps, emitter} = await setup({overlap: 'replace', rangeFrom: 200, rangeTo: 600, cleanupBatchSize: 1});
            await seedRows(db, mirror.id, [300, 400, 500]);
            const runner = new JobRunner(job.id, deps(new FakeTimeProvider([350])));
            emitter.on('mirrorUpdate', (e: {data: {task?: {done: number} | null}}) => {
                if ((e.data.task?.done ?? 0) === 1) {
                    void runner.stopImport('stopped');
                }
            });
            await runToEnd(runner);
            let state = (await jobs.getById(job.id))!;
            expect(state.importStatus).eq('stopped');
            expect(state.importReplacedAt).null;
            expect(await count(db)).eq(2);

            emitter.removeAllListeners('mirrorUpdate');
            await runToEnd(runner);
            state = (await jobs.getById(job.id))!;
            expect(state.importStatus).eq('completed');
            expect((await db.select().from(playsHistorical)).map(x => x.playedAt!.valueOf())).to.deep.eq([350]);
        });

        it('replace: does not start while another job exports from the range', async function () {
            const {db, mirror, job, jobs, deps} = await setup({overlap: 'replace', replaceConflicts: ['other job']});
            await seedRows(db, mirror.id, [400]);
            const runner = new JobRunner(job.id, deps(new FakeTimeProvider([300])));
            let err: unknown;
            try {
                await runner.startImport();
            } catch (e) {
                err = e;
            }
            expect(err).instanceOf(JobConflictError);
            expect((err as Error).message).includes("'other job'");
            expect(await count(db)).eq(1);
            expect((await jobs.getById(job.id))!.importReplacedAt).null;
        });
    });
});
