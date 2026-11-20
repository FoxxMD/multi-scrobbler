import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { eq } from 'drizzle-orm';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { JobTargetRepository } from '../../common/database/drizzle/repositories/JobTargetRepository.ts';
import { playInputs, plays, queueStates } from '../../common/database/drizzle/schema/schema.ts';
import { componentLockKey, type ExportClient, JobConflictError } from '../../jobs/JobRunner.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0, exportPoll: 10};

/**
 * A real (not processing) client with, for one job:
 * * 2 queued job plays
 * * 2 scrobbled job plays
 * plus 1 orphan job play (job deleted) and 1 normal play
 * */
const setup = async () => {
    const scrobbler = new TestScrobbler();
    await scrobbler.initialize();
    const db = scrobbler.playRepoTest.db;
    const componentId = scrobbler.componentId;
    const mirror = await new MirrorRepository(db).findOrCreate({userId: null as unknown as string, service: 'lastfm', account: null, name: 'm'});
    const jobRepo = new JobRepository(db);
    const job = await jobRepo.create({name: 'export', mirrorId: mirror.id, rangeTo: dayjs(), importStatus: 'completed'});
    const targetRepo = new JobTargetRepository(db);
    const [target] = await targetRepo.createForJob(job.id, [componentId]);
    await targetRepo.update(target.id, {status: 'stopped'});

    await scrobbler.queuePlay([generatePlay(), generatePlay()], undefined, {jobId: job.id});
    const done = await db.insert(plays).values([
        fixtureCreatePlay({state: 'scrobbled', componentId, jobId: job.id, play: generatePlay({}, {jobId: job.id})}),
        fixtureCreatePlay({state: 'scrobbled', componentId, jobId: job.id, play: generatePlay({}, {jobId: job.id})}),
        // orphan of a deleted job
        fixtureCreatePlay({state: 'scrobbled', componentId, play: generatePlay({}, {jobId: 9999})}),
        // a normal play
        fixtureCreatePlay({state: 'scrobbled', componentId, play: generatePlay()}),
    ]).returning();
    for (const p of done) {
        await db.insert(playInputs).values({playId: p.id, play: p.play, data: {raw: true}});
    }
    const events: {name: string, data: unknown}[] = [];
    const manager = new JobManager({db, logger: loggerTest, timings, createProvider: () => undefined, resolveClient: (id) => id === componentId ? scrobbler as unknown as ExportClient : undefined});
    for (const name of ['playsPurged', 'clientJobPlaysUpdate', 'jobUpdate']) {
        manager.emitter.on(name, (e: unknown) => events.push({name, data: structuredClone(e)}));
    }
    const state = async () => {
        const rows = await db.select().from(plays).where(eq(plays.componentId, componentId));
        const queued = new Set((await db.select().from(queueStates)).map(x => x.playId));
        return {
            jobQueued: rows.filter(x => x.jobId === job.id && queued.has(x.id)).length,
            jobDone: rows.filter(x => x.jobId === job.id && !queued.has(x.id)),
            orphan: rows.find(x => x.jobId === null && x.play.meta.jobId === 9999),
            normal: rows.find(x => x.jobId === null && x.play.meta.jobId === undefined),
            total: rows.length,
        };
    }
    return {scrobbler, db, componentId, job, target, targetRepo, manager, events, state, normalId: done[3].id};
}

describe('Job play cleanup', function () {

    it('job cleanup dequeues queued plays, then deletes all of the job\'s plays and nothing else', async function () {
        const {scrobbler, job, manager, events, state, target, targetRepo} = await setup();
        try {
            expect(scrobbler.queuedLength).eq(2);
            const deadBefore = scrobbler.deadLetterLength;
            await (await manager.cleanupJobScrobbles(job.id, 'delete')).done;

            const s = await state();
            expect(s.jobQueued).eq(0);
            expect(s.jobDone).length(0);
            expect(s.orphan).not.eq(undefined);
            expect(s.normal).not.eq(undefined);
            // counters recounted from the db, not left inflated by the dequeue
            expect(scrobbler.queuedLength).eq(0);
            expect(scrobbler.deadLetterLength).eq(deadBefore);
            expect(events.some(x => x.name === 'playsPurged')).is.true;
            // stats were saved before the plays were deleted
            expect((await targetRepo.getById(target.id))!.stats).to.deep.eq({queued: 2, scrobbled: 2});
            expect(manager.getRuntime(job.id)?.cleanup).eq(undefined);
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('job cleanup compacts the job\'s plays', async function () {
        const {db, scrobbler, job, manager, state} = await setup();
        try {
            await (await manager.cleanupJobScrobbles(job.id, 'compact')).done;
            const s = await state();
            expect(s.jobQueued).eq(0);
            expect(s.jobDone.map(x => x.compacted)).to.deep.eq(['input-transform', 'input-transform', 'input-transform', 'input-transform']);
            expect(s.orphan!.compacted).eq(null);
            const inputs = await db.select().from(playInputs).where(eq(playInputs.playId, s.normal!.id));
            expect(inputs[0].data).eql({raw: true});
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('client cleanup skips queued plays and includes plays of deleted jobs', async function () {
        const {scrobbler, componentId, manager, events, state} = await setup();
        try {
            await (await manager.cleanupClientJobPlays(componentId, 'delete')).done;
            const s = await state();
            expect(s.jobQueued).eq(2);
            expect(s.jobDone).length(0);
            expect(s.orphan).eq(undefined);
            expect(s.normal).not.eq(undefined);
            expect(scrobbler.queuedLength).eq(2);
            const result = events.findLast(x => x.name === 'clientJobPlaysUpdate')!.data as {data: {task: null, taskResult: {done: number, skipped: number, cancelled: number}}};
            expect(result.data.task).eq(null);
            expect(result.data.taskResult).to.include({done: 3, skipped: 2, cancelled: 0});
            expect(manager.getClientCleanup(componentId)).eq(undefined);
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('does not overwrite the stats of a completed export', async function () {
        const {scrobbler, componentId, manager, target, targetRepo} = await setup();
        try {
            await targetRepo.update(target.id, {status: 'completed', stats: {scrobbled: 10}});
            await (await manager.cleanupClientJobPlays(componentId, 'delete')).done;
            expect((await targetRepo.getById(target.id))!.stats).to.deep.eq({scrobbled: 10});
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('refuses while an export to the client runs', async function () {
        const {scrobbler, componentId, job, target, manager, state} = await setup();
        try {
            // export loop keeps running: the client is not started, so it waits
            await manager.startExport(job.id, target.id);
            for (const start of [() => manager.cleanupClientJobPlays(componentId, 'delete'), () => manager.cleanupJobScrobbles(job.id, 'delete')]) {
                let err: unknown;
                try {
                    await start();
                } catch (e) {
                    err = e;
                }
                expect(err).instanceOf(JobConflictError);
            }
            expect(manager.locks.holder(componentLockKey(componentId))).eq(undefined);
            expect((await state()).total).eq(6);
            await manager.stopJob(job.id, 'stopped');
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('refuses while the client is already being cleaned up', async function () {
        const {scrobbler, componentId, job, manager, state} = await setup();
        try {
            manager.locks.tryAcquire(componentLockKey(componentId), 'other');
            for (const start of [() => manager.cleanupClientJobPlays(componentId, 'delete'), () => manager.cleanupJobScrobbles(job.id, 'delete')]) {
                let err: unknown;
                try {
                    await start();
                } catch (e) {
                    err = e;
                }
                expect(err).instanceOf(JobConflictError);
            }
            expect(manager.locks.holder(componentLockKey(componentId))).eq('other');
            expect((await state()).total).eq(6);
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });
});
