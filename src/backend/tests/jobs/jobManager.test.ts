import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { components, plays, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { mirrorImportLockKey } from '../../jobs/JobRunner.ts';
import { MirrorRepository as Mirrors } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { isLastfmImportSource, JobManager } from '../../jobs/JobManager.ts';
import LastfmApiClient from '../../common/vendor/LastfmApiClient.ts';
import type { ImportProvider } from '../../jobs/ImportProvider.ts';
import { FakeTimeProvider } from './fakes.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { JobTargetRepository } from '../../common/database/drizzle/repositories/JobTargetRepository.ts';
import type TransformerManager from '../../common/transforms/TransformerManager.ts';

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0, exportPoll: 10};

const setup = async () => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
    const jobs = new JobRepository(db);
    const newJob = (name = 'job') => jobs.create({userId: owner.id, name, mirrorId: mirror.id, rangeTo: dayjs(1000), componentFromId: undefined, importStatus: 'running'});
    const manager = (provider: () => ImportProvider) => new JobManager({db, logger: loggerTest, timings, createProvider: provider});
    return {db, jobs, newJob, manager, mirror};
}

const settle = async (manager: JobManager, jobId: number) => {
    // @ts-expect-error reading protected task for test
    await manager.getRunner(jobId).importTask?.promise;
}

describe('Job manager', function () {

    it('only accepts Last.fm components as import sources, not Libre.fm', function () {
        const api = Object.create(LastfmApiClient.prototype);
        expect(isLastfmImportSource({type: 'lastfm', api, isReady: () => true})).to.be.true;
        expect(isLastfmImportSource({type: 'librefm', api, isReady: () => true})).to.be.false;
    });

    it('resumes exports that were running at shutdown and stops them with the job', async function () {
        const {db, jobs, newJob} = await setup();
        const job = await newJob();
        await jobs.update(job.id, {importStatus: 'completed'});
        const [client] = await db.insert(components).values(fixtureCreateComponent({mode: 'client'})).returning();
        const targetRepo = new JobTargetRepository(db);
        const [target] = await targetRepo.createForJob(job.id, [client.id]);
        await targetRepo.update(target.id, {status: 'running'});
        // no client resolves, so the export waits instead of finishing
        const m = new JobManager({db, logger: loggerTest, timings, createProvider: () => undefined});
        await m.resumeAll();
        expect(m.getRunner(job.id).exportsRunning).to.deep.eq([target.id]);

        await m.stopJob(job.id, 'paused');
        expect(m.getRunner(job.id).exportsRunning).length(0);
        expect((await targetRepo.getById(target.id))!.status).eq('paused');
    });

    it('marks a resumed export failed when its transforms are no longer valid', async function () {
        const {db, jobs, newJob} = await setup();
        const job = await newJob();
        await jobs.update(job.id, {importStatus: 'completed', transformOptions: [{type: 'gone'}]});
        const [client] = await db.insert(components).values(fixtureCreateComponent({mode: 'client'})).returning();
        const targetRepo = new JobTargetRepository(db);
        const [target] = await targetRepo.createForJob(job.id, [client.id]);
        await targetRepo.update(target.id, {status: 'running'});
        const transformerManager = {parseTransformerConfig: async () => { throw new Error('no transformer gone'); }} as unknown as TransformerManager;
        const m = new JobManager({db, logger: loggerTest, timings, createProvider: () => undefined, transformerManager});
        await m.resumeAll();
        const failed = (await targetRepo.getById(target.id))!;
        expect(failed.status).eq('failed');
        expect(failed.error?.message).to.include('no transformer gone');
    });

    it('resumes imports that were running at shutdown', async function () {
        const {jobs, newJob, manager} = await setup();
        const job = await newJob();
        const m = manager(() => new FakeTimeProvider([100, 200, 300]));
        await m.resumeAll();
        await settle(m, job.id);
        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('completed');
        expect(done.imported).eq(3);
    });

    it('marks a resumed import failed when it conflicts with another on the same mirror', async function () {
        const {jobs, newJob, manager} = await setup();
        const a = await newJob('a');
        const b = await newJob('b');
        let release!: () => void;
        const blocked = new Promise<void>(r => { release = r; });
        const m = manager(() => {
            const p = new FakeTimeProvider([100]);
            p.onFetch = () => blocked;
            return p;
        });
        await m.resumeAll();
        const statuses = [(await jobs.getById(a.id))!.importStatus, (await jobs.getById(b.id))!.importStatus].sort();
        expect(statuses).to.deep.eq(['failed', 'running']);
        release();
        await settle(m, a.id);
        await settle(m, b.id);
    });

    it('deleting a job stops its import and keeps client plays', async function () {
        const {db, jobs, newJob, manager, mirror} = await setup();
        const job = await newJob();
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'listenbrainz'})).returning();
        await db.insert(plays).values(fixtureCreatePlay({componentId: component[0].id, state: 'scrobbled', jobId: job.id}));

        let release!: () => void;
        const blocked = new Promise<void>(r => { release = r; });
        const m = manager(() => {
            const p = new FakeTimeProvider([100, 200]);
            p.onFetch = () => blocked;
            return p;
        });
        await m.startImport(job.id);
        const runner = m.getRunner(job.id);
        const deleting = m.deleteJob(job.id);
        release();
        await deleting;

        expect(runner.importRunning).is.false;
        expect(m.locks.holder(mirrorImportLockKey(mirror.id))).to.be.undefined;
        expect(await db.select().from(playsHistorical)).length(0);
        expect(await jobs.getById(job.id)).to.be.undefined;
        const remaining = await db.select().from(plays);
        expect(remaining).length(1);
        expect(remaining[0].jobId).to.be.null;
    });

    it('resumes an import interrupted by shutdown without duplicates', async function () {
        const {db, jobs, newJob, manager, mirror} = await setup();
        const job = await newJob();
        const ts = [100, 200, 300, 400, 500, 600, 700, 800, 900];
        let first!: JobManager;
        first = manager(() => {
            const p = new FakeTimeProvider(ts, 2);
            p.onFetch = (n) => { if (n === 3) { void first.shutdown(); } };
            return p;
        });
        await first.resumeAll();
        await settle(first, job.id);
        const interrupted = (await jobs.getById(job.id))!;
        expect(interrupted.importStatus).eq('running');
        expect(interrupted.imported).lt(9);

        const second = manager(() => new FakeTimeProvider(ts, 2));
        await second.resumeAll();
        await settle(second, job.id);

        const done = (await jobs.getById(job.id))!;
        expect(done.importStatus).eq('completed');
        expect(done.imported).eq(9);
        expect(done.importTotal).eq(9);
        expect(await db.select().from(playsHistorical)).length(9);
        expect((await new Mirrors(db).getById(mirror.id))!.coverage).to.deep.eq([[0, 1000]]);
    });

    it('does not start imports after shutdown', async function () {
        const {jobs, newJob, manager} = await setup();
        const job = await newJob();
        const provider = new FakeTimeProvider([100]);
        const m = manager(() => provider);
        await m.shutdown();
        await m.resumeAll();
        expect(provider.fetches).length(0);
        expect((await jobs.getById(job.id))!.importStatus).eq('running');
    });

    it('fails to start a job whose import origin has no provider', async function () {
        const {db, jobs, newJob} = await setup();
        const job = await newJob();
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'source', type: 'spotify'})).returning();
        await jobs.update(job.id, {importStatus: 'idle', componentFromId: component[0].id});
        const m = new JobManager({db, logger: loggerTest, timings});
        let err: unknown;
        try {
            await m.startImport(job.id);
        } catch (e) {
            err = e;
        }
        expect(err).to.be.instanceOf(Error);
    });
});
