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
import type { DbConcrete } from '../../common/database/drizzle/drizzleUtils.ts';

const timings = {importPageDelay: 0, importRetries: 2, importRetryBase: 1, readyTimeout: 30, readyPoll: 5, emitThrottle: 0};

const setup = async (opts: {provider?: ImportProvider, persistInputs?: boolean, rangeFrom?: number, rangeTo?: number, coverage?: [number, number][]} = {}) => {
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
    });
    const locks = new LockRegistry();
    const deps = (provider: ImportProvider | undefined): JobRunnerDeps => ({db, logger: loggerTest, locks, emitter: new WildcardEmitter(), createProvider: () => provider, timings});
    return {db, owner, mirror, mirrors, jobs, job, locks, deps};
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
});
