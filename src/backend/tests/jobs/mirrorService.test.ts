import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { historicalPlayInputs, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { JobConflictError, mirrorLockKey } from '../../jobs/JobRunner.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import { LockRegistry } from '../../jobs/LockRegistry.ts';
import { MirrorService } from '../../jobs/MirrorService.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { FakeTimeProvider } from './fakes.ts';

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0, exportPoll: 10};

const setup = async (opts: {active?: boolean, batchSize?: number} = {}) => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const mirrors = new MirrorRepository(db);
    const mirror = await mirrors.findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
    await mirrors.addCoverage(mirror.id, [100, 1000]);
    const historical = new DrizzlePlayHistoricalRepository(db);
    await historical.insertIgnoreDuplicates([100, 200, 300, 400, 500].map(ts => ({
        uid: `m${mirror.id}:${ts}`,
        mirrorId: mirror.id,
        play: generatePlay({playDate: dayjs(ts)}),
        input: {data: {raw: ts}},
    })), {persistInputs: true});
    const locks = new LockRegistry();
    const emitter = new WildcardEmitter();
    const events: {name: string, data: Record<string, unknown>}[] = [];
    emitter.on('mirrorUpdate', (e: {data: Record<string, unknown>}) => events.push({name: 'mirrorUpdate', data: structuredClone(e.data)}));
    emitter.on('mirrorDeleted', (e: Record<string, unknown>) => events.push({name: 'mirrorDeleted', data: e}));
    const service = new MirrorService({db, logger: loggerTest, locks, emitter, isJobActive: () => opts.active ?? false, batchSize: opts.batchSize});
    const jobs = new JobRepository(db);
    return {db, owner, mirrors, mirror, historical, locks, events, service, jobs};
}

const rows = async (db: Awaited<ReturnType<typeof setup>>['db']) => (await db.select().from(playsHistorical)).map(x => ({ts: x.playedAt!.valueOf(), compacted: x.compacted}));

describe('Mirror service', function () {

    it('compacts raw data of plays in a range and keeps the plays and coverage', async function () {
        const {db, mirrors, mirror, service, locks} = await setup();
        const {done} = await service.startCleanup(mirror.id, {action: 'compact', range: [200, 300]});
        await done;

        expect(await rows(db)).to.deep.eq([
            {ts: 100, compacted: null},
            {ts: 200, compacted: 'input'},
            {ts: 300, compacted: 'input'},
            {ts: 400, compacted: null},
            {ts: 500, compacted: null},
        ]);
        const inputs = await db.select().from(historicalPlayInputs);
        expect(inputs.filter(x => (x.data as {removedReason?: string}).removedReason !== undefined)).length(2);
        expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([[100, 1000]]);
        expect(locks.holder(mirrorLockKey(mirror.id))).eq(undefined);
    });

    it('compacting again only counts plays not compacted yet', async function () {
        const {mirror, service, events} = await setup();
        await (await service.startCleanup(mirror.id, {action: 'compact'})).done;
        await (await service.startCleanup(mirror.id, {action: 'compact'})).done;
        const results = events.filter(x => x.data.taskResult !== undefined).map(x => x.data.taskResult as {done: number, total: number});
        expect(results.map(x => [x.done, x.total])).to.deep.eq([[5, 5], [0, 0]]);
    });

    it('removes coverage before deleting plays in a range', async function () {
        const {db, mirrors, mirror, service, events} = await setup({batchSize: 1});
        await (await service.startCleanup(mirror.id, {action: 'delete', range: [200, 400]})).done;

        expect((await rows(db)).map(x => x.ts)).to.deep.eq([100, 500]);
        expect(await db.select().from(historicalPlayInputs)).length(2);
        expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([[100, 199], [401, 1000]]);

        const coverageAt = events.findIndex(x => x.data.coverage !== undefined);
        const firstBatchAt = events.findIndex(x => (x.data.task as {done?: number} | undefined)?.done === 1);
        expect(coverageAt).to.be.greaterThan(-1);
        expect(coverageAt).to.be.lessThan(firstBatchAt);
    });

    it('deleting without a range removes all plays and coverage but keeps the mirror', async function () {
        const {db, mirrors, mirror, service} = await setup();
        await (await service.startCleanup(mirror.id, {action: 'delete'})).done;
        expect(await rows(db)).length(0);
        expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([]);
    });

    it('refuses to clean up while a job using the mirror is running, and releases the lock', async function () {
        const {mirror, service, locks, jobs} = await setup({active: true});
        await jobs.create({name: 'busy', mirrorId: mirror.id, rangeTo: dayjs(1000)});
        let err: unknown;
        try {
            await service.startCleanup(mirror.id, {action: 'delete'});
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(JobConflictError);
        expect((err as Error).message).to.include("'busy'");
        expect(locks.holder(mirrorLockKey(mirror.id))).eq(undefined);
    });

    it('refuses a second cleanup while one is running', async function () {
        const {db, mirror, service, locks} = await setup();
        locks.tryAcquire(mirrorLockKey(mirror.id), 'other');
        let err: unknown;
        try {
            await service.startCleanup(mirror.id, {action: 'compact'});
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(JobConflictError);
        expect(locks.holder(mirrorLockKey(mirror.id))).eq('other');
        expect((await rows(db)).every(x => x.compacted === null)).to.be.true;
    });

    it('refuses to delete a mirror used by a job', async function () {
        const {db, mirrors, mirror, service, jobs} = await setup();
        await jobs.create({name: 'uses it', mirrorId: mirror.id, rangeTo: dayjs(1000)});
        let err: unknown;
        try {
            await service.startDelete(mirror.id);
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(JobConflictError);
        expect(await mirrors.getById(mirror.id)).not.eq(undefined);
        expect(await rows(db)).length(5);
    });

    it('deletes a mirror with its plays and inputs', async function () {
        const {db, mirrors, mirror, service, events} = await setup({batchSize: 2});
        await (await service.startDelete(mirror.id)).done;
        expect(await mirrors.getById(mirror.id)).eq(undefined);
        expect(await rows(db)).length(0);
        expect(await db.select().from(historicalPlayInputs)).length(0);
        expect(events.at(-2)?.name).eq('mirrorDeleted');
        expect((events.at(-1)!.data.taskResult as {done: number}).done).eq(5);
    });

    it('reports details with gaps between covered ranges, and renames', async function () {
        const {mirrors, mirror, service, jobs} = await setup();
        await mirrors.addCoverage(mirror.id, [2000, 3000]);
        await jobs.create({name: 'j', mirrorId: mirror.id, rangeTo: dayjs(1000)});
        await service.rename(mirror.id, 'renamed');
        const details = await service.get(mirror.id);
        expect(details!.mirror.name).eq('renamed');
        expect(details!.plays).eq(5);
        expect(details!.gaps).to.deep.eq([[1001, 1999]]);
        expect(details!.jobs.map(x => x.name)).to.deep.eq(['j']);
    });

    it('imports into the mirror cannot start during a cleanup', async function () {
        const {db, owner, mirror, jobs} = await setup();
        const job = await jobs.create({userId: owner.id, name: 'imp', mirrorId: mirror.id, rangeTo: dayjs(1000)});
        const manager = new JobManager({db, logger: loggerTest, timings, createProvider: () => new FakeTimeProvider([150])});
        manager.locks.tryAcquire(mirrorLockKey(mirror.id), 'cleanup');
        let err: unknown;
        try {
            await manager.startImport(job.id);
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(JobConflictError);
    });

    it('the job manager refuses mirror cleanups while a job is importing', async function () {
        const {db, owner, mirror, jobs} = await setup();
        const job = await jobs.create({userId: owner.id, name: 'imp', mirrorId: mirror.id, rangeTo: dayjs(5000)});
        const provider = new FakeTimeProvider([4000, 3000]);
        let release!: () => void;
        const blocked = new Promise<void>(r => { release = r; });
        provider.onFetch = () => blocked;
        const manager = new JobManager({db, logger: loggerTest, timings, createProvider: () => provider});
        await manager.startImport(job.id);
        let err: unknown;
        try {
            await manager.mirrors.startCleanup(mirror.id, {action: 'compact'});
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(JobConflictError);
        release();
        await manager.stopImport(job.id, 'stopped');
    });
});
