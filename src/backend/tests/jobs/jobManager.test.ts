import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { components, plays } from '../../common/database/drizzle/schema/schema.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import type { ImportProvider } from '../../jobs/ImportProvider.ts';
import { FakeTimeProvider } from './fakes.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0};

const setup = async () => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
    const jobs = new JobRepository(db);
    const newJob = (name = 'job') => jobs.create({userId: owner.id, name, mirrorId: mirror.id, rangeTo: dayjs(1000), componentFromId: undefined, importStatus: 'running'});
    const manager = (provider: () => ImportProvider) => new JobManager({db, logger: loggerTest, timings, createProvider: provider});
    return {db, jobs, newJob, manager};
}

const settle = async (manager: JobManager, jobId: number) => {
    // @ts-expect-error reading protected task for test
    await manager.getRunner(jobId).importTask?.promise;
}

describe('Job manager', function () {

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
        const {db, jobs, newJob, manager} = await setup();
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
        const deleting = m.deleteJob(job.id);
        release();
        await deleting;

        expect(await jobs.getById(job.id)).to.be.undefined;
        const remaining = await db.select().from(plays);
        expect(remaining).length(1);
        expect(remaining[0].jobId).to.be.null;
    });

    it('fails to start a job whose import origin has no provider', async function () {
        const {db, jobs, newJob} = await setup();
        const job = await newJob();
        await jobs.update(job.id, {importStatus: 'idle', importFile: {path: '/nope', originalName: 'x.csv', format: 'lastfm-ghan-csv', size: 1, managed: false}});
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
