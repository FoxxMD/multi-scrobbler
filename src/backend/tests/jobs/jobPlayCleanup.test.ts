import { MIRROR_SERVICE_MIXED } from '../../../core/Job.ts';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { eq } from 'drizzle-orm';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository, type JobSelect } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { addStats, JobTargetRepository } from '../../common/database/drizzle/repositories/JobTargetRepository.ts';
import { playInputs, plays, playsHistorical, queueStates } from '../../common/database/drizzle/schema/schema.ts';
import { componentLockKey, type ExportClient, JobConflictError, mirrorLockKey } from '../../jobs/JobRunner.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
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
    const mirror = await new MirrorRepository(db).findOrCreate({userId: null as unknown as string, service: MIRROR_SERVICE_MIXED, account: null, name: 'm'});
    const jobRepo = new JobRepository(db);
    const job = await jobRepo.create({name: 'export', mirrorId: mirror.id, rangeTo: dayjs(), importStatus: 'completed'}) as JobSelect;
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
    const manager = new JobManager({db, logger: loggerTest, timings, createProvider: () => undefined, cleanupBatchSize: 1, resolveClient: (id) => id === componentId ? scrobbler as unknown as ExportClient : undefined});
    for (const name of ['playsPurged', 'clientJobPlaysUpdate', 'jobUpdate', 'jobDeleted']) {
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
            // deleted plays are remembered so the export keeps its numbers (dequeued, never processed => failed)
            const after = (await targetRepo.getById(target.id))!;
            expect(after.removedStats).to.deep.eq({failed: 2, scrobbled: 2});
            expect(after.stats).eq(null);
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
            const after = (await targetRepo.getById(target.id))!;
            expect(after.stats).to.deep.eq({scrobbled: 10});
            expect(after.removedStats).eq(null);
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

    describe('Job delete with cleanup', function () {

        const withMirrorPlays = async (ctx: Awaited<ReturnType<typeof setup>>) => {
            const {db, job} = ctx;
            const mirrors = new MirrorRepository(db);
            await mirrors.addCoverage(job.mirrorId, [0, job.rangeTo.valueOf()]);
            // one inside the job's range, one after it
            await new DrizzlePlayHistoricalRepository(db).insertIgnoreDuplicates([job.rangeTo.valueOf() - 1000, job.rangeTo.valueOf() + 1000].map(ts => ({
                uid: `m${job.mirrorId}:${ts}`, mirrorId: job.mirrorId, play: generatePlay({playDate: dayjs(ts)}),
            })));
            return mirrors;
        }

        it('cleans up scrobbles, then mirror data in range, then deletes the job', async function () {
            const ctx = await setup();
            const {db, scrobbler, job, manager, events, state} = ctx;
            try {
                const mirrors = await withMirrorPlays(ctx);
                const {done} = await manager.deleteJobWithCleanup(job.id, {historical: 'delete', scrobbles: 'delete'});
                expect(manager.getRuntime(job.id)?.deleting).eq(true);
                expect(await done).to.deep.eq({});

                const s = await state();
                // cleaned before the job row was deleted, which would have unlinked them
                expect(s.total).eq(2);
                expect(s.orphan).not.eq(undefined);
                expect(s.normal).not.eq(undefined);
                expect((await db.select().from(playsHistorical)).map(x => x.playedAt!.valueOf())).to.deep.eq([job.rangeTo.valueOf() + 1000]);
                expect((await mirrors.getById(job.mirrorId))!.coverage).to.deep.eq([]);
                expect(await new JobRepository(db).getById(job.id)).eq(undefined);
                expect(events.some(x => x.name === 'jobDeleted')).is.true;
                expect(manager.locks.holder(componentLockKey(scrobbler.componentId))).eq(undefined);
                expect(manager.locks.holder(mirrorLockKey(job.mirrorId))).eq(undefined);
            } finally {
                await scrobbler[Symbol.asyncDispose]();
            }
        });

        it('keeps everything when asked, and stops running exports first', async function () {
            const {db, scrobbler, job, target, manager, state} = await setup();
            try {
                await manager.startExport(job.id, target.id);
                await (await manager.deleteJobWithCleanup(job.id, {historical: 'keep', scrobbles: 'keep'})).done;
                const s = await state();
                expect(s.total).eq(6);
                expect(await new JobRepository(db).getById(job.id)).eq(undefined);
                expect(manager.getRunner(job.id).exportsRunning).length(0);
            } finally {
                await scrobbler[Symbol.asyncDispose]();
            }
        });

        it('refuses before changing anything when another job uses the mirror', async function () {
            const ctx = await setup();
            const {db, scrobbler, job, target, manager, state, componentId} = ctx;
            try {
                await withMirrorPlays(ctx);
                // this job's own export keeps running when refused
                await manager.startExport(job.id, target.id);
                const other = await new JobRepository(db).create({name: 'other', mirrorId: job.mirrorId, rangeTo: dayjs(), importStatus: 'completed'});
                const [otherTarget] = await new JobTargetRepository(db).createForJob(other.id, [componentId]);
                await manager.startExport(other.id, otherTarget.id);
                let err: unknown;
                try {
                    await manager.deleteJobWithCleanup(job.id, {historical: 'delete', scrobbles: 'delete'});
                } catch (e) {
                    err = e;
                }
                expect(err).instanceOf(JobConflictError);
                expect((err as Error).message).to.include("'other'");
                expect((await state()).total).eq(6);
                expect(await db.select().from(playsHistorical)).length(2);
                expect(await new JobRepository(db).getById(job.id)).not.eq(undefined);
                expect(manager.locks.holder(componentLockKey(componentId))).eq(undefined);
                expect(manager.getRuntime(job.id)?.deleting).eq(undefined);
                expect(manager.getRunner(job.id).exportsRunning).to.deep.eq([target.id]);
                await manager.stopJob(other.id, 'stopped');
                await manager.stopJob(job.id, 'stopped');
            } finally {
                await scrobbler[Symbol.asyncDispose]();
            }
        });

        it('refuses before changing anything when a client is locked', async function () {
            const ctx = await setup();
            const {db, scrobbler, job, manager, state, componentId} = ctx;
            try {
                manager.locks.tryAcquire(componentLockKey(componentId), 'other');
                let err: unknown;
                try {
                    await manager.deleteJobWithCleanup(job.id, {historical: 'delete', scrobbles: 'delete'});
                } catch (e) {
                    err = e;
                }
                expect(err).instanceOf(JobConflictError);
                expect(manager.locks.holder(mirrorLockKey(job.mirrorId))).eq(undefined);
                expect((await state()).total).eq(6);
                expect(await new JobRepository(db).getById(job.id)).not.eq(undefined);
            } finally {
                await scrobbler[Symbol.asyncDispose]();
            }
        });

        it('refuses a second delete and starting the job while deleting', async function () {
            const {scrobbler, job, target, manager, events} = await setup();
            try {
                const first = manager.deleteJobWithCleanup(job.id, {historical: 'keep', scrobbles: 'keep'});
                const second = manager.deleteJobWithCleanup(job.id, {historical: 'keep', scrobbles: 'keep'});
                const [a, b] = await Promise.allSettled([first, second]);
                expect(a.status).eq('fulfilled');
                expect(b.status).eq('rejected');
                expect((b as PromiseRejectedResult).reason).instanceOf(JobConflictError);
                for (const start of [() => manager.startExport(job.id, target.id), () => manager.startImport(job.id), () => manager.cleanupJobScrobbles(job.id, 'delete')]) {
                    let err: unknown;
                    try {
                        await start();
                    } catch (e) {
                        err = e;
                    }
                    expect(err).instanceOf(JobConflictError);
                }
                await (a as PromiseFulfilledResult<{done: Promise<unknown>}>).value.done;
                expect(events.filter(x => x.name === 'jobDeleted')).length(1);
            } finally {
                await scrobbler[Symbol.asyncDispose]();
            }
        });

        it('keeps the job and reports the error when the mirror cleanup fails', async function () {
            const {db, scrobbler, job, manager, events} = await setup();
            try {
                manager.mirrors.startCleanup = async () => ({done: Promise.resolve({error: 'disk full'})});
                const {error} = await (await manager.deleteJobWithCleanup(job.id, {historical: 'delete', scrobbles: 'keep'})).done;
                expect(error).to.include('disk full');
                expect(await new JobRepository(db).getById(job.id)).not.eq(undefined);
                expect(manager.getRuntime(job.id)?.deleting).eq(undefined);
                const last = events.findLast(x => x.name === 'jobUpdate')!.data as {data: {deleteError?: string}};
                expect(last.data.deleteError).to.include('disk full');
                expect(manager.locks.holder(mirrorLockKey(job.mirrorId))).eq(undefined);
            } finally {
                await scrobbler[Symbol.asyncDispose]();
            }
        });
    });

    it('removed stats add up over cleanups and compacting removes nothing', async function () {
        const {scrobbler, componentId, job, manager, target, targetRepo} = await setup();
        try {
            await (await manager.cleanupClientJobPlays(componentId, 'compact')).done;
            expect((await targetRepo.getById(target.id))!.removedStats).eq(null);
            await (await manager.cleanupClientJobPlays(componentId, 'delete')).done;
            expect((await targetRepo.getById(target.id))!.removedStats).to.deep.eq({scrobbled: 2});
            // the queued ones, dequeued now
            await (await manager.cleanupJobScrobbles(job.id, 'delete')).done;
            expect((await targetRepo.getById(target.id))!.removedStats).to.deep.eq({scrobbled: 2, failed: 2});
        } finally {
            await scrobbler[Symbol.asyncDispose]();
        }
    });

    it('adds stats per state', function () {
        expect(addStats({scrobbled: 5, failed: 1}, {scrobbled: 2, duped: 1})).to.deep.eq({scrobbled: 7, failed: 1, duped: 1});
        expect(addStats(undefined, null)).to.deep.eq({});
    });
});
