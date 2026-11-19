import { expect } from 'chai';
import dayjs from 'dayjs';
import { eq } from 'drizzle-orm';
import { components, playEvents, playInputs, plays } from '../../common/database/drizzle/schema/schema.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { DrizzlePlayRepository } from '../../common/database/drizzle/repositories/PlayRepository.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import type { RetentionOptions } from '../../common/infrastructure/config/database.ts';

const days = (n: number) => dayjs.duration(n, 'days');

const retention = (opts: Partial<RetentionOptions> = {}): RetentionOptions => ({
    deleteAfter: {completed: days(30), failed: days(30), duped: days(30)},
    compactAfter: {completed: days(3), failed: days(3), duped: days(3)},
    compact: ['input', 'transform'],
    ...opts,
});

const transformData = [{stageName: 'a', stageType: 'user', hook: 'preCompare', source: 'x', inputs: [{type: 'musicbrainz', input: {secret: 'raw'}}]}];

const seed = async (age: number, state: 'scrobbled' | 'failed' | 'duped' | 'queued' = 'scrobbled') => {
    const db = await transientDb();
    const [component] = await db.insert(components).values(fixtureCreateComponent()).returning();
    const repo = new DrizzlePlayRepository(db, {componentId: component.id});
    const at = dayjs().subtract(age, 'days');
    const [row] = await db.insert(plays).values({...fixtureCreatePlay({state, componentId: component.id}), seenAt: at, updatedAt: at}).returning();
    await db.insert(playInputs).values({playId: row.id, play: row.play, data: {raw: true}});
    await db.insert(playEvents).values({playId: row.id, eventName: 'transform', data: transformData} as typeof playEvents.$inferInsert);
    return {db, repo, component, row};
}

describe('Play cleanup', function () {

    describe('retentionCleanup', function () {

        it('compacts inputs and transform events of old plays', async function () {
            const {db, repo, component, row} = await seed(5);
            await repo.retentionCleanup('client', {...retention(), componentId: component.id});

            const play = await db.query.plays.findFirst({where: {id: row.id}});
            expect(play?.compacted).eq('input-transform');
            const input = await db.query.playInputs.findFirst({where: {playId: row.id}});
            expect(input?.data).eql({removedReason: 'Removed by compaction'});
            const ev = await db.query.playEvents.findFirst({where: {playId: row.id}});
            expect((ev?.data as typeof transformData)[0].inputs).eql([{type: 'musicbrainz', input: 'Removed by compaction'}]);
        });

        it('compacts only the configured types', async function () {
            const {db, repo, component, row} = await seed(5);
            await repo.retentionCleanup('client', {...retention({compact: ['input']}), componentId: component.id});

            expect((await db.query.plays.findFirst({where: {id: row.id}}))?.compacted).eq('input');
            expect((await db.query.playInputs.findFirst({where: {playId: row.id}}))?.data).eql({removedReason: 'Removed by compaction'});
            expect(((await db.query.playEvents.findFirst({where: {playId: row.id}}))?.data as typeof transformData)[0].inputs[0].input).eql({secret: 'raw'});
        });

        it('does not compact recent plays', async function () {
            const {db, repo, component, row} = await seed(1);
            await repo.retentionCleanup('client', {...retention(), componentId: component.id});

            expect((await db.query.plays.findFirst({where: {id: row.id}}))?.compacted).eq(null);
            expect((await db.query.playInputs.findFirst({where: {playId: row.id}}))?.data).eql({raw: true});
        });

        it('deletes old plays with their inputs and events', async function () {
            const {db, repo, component, row} = await seed(40, 'failed');
            await repo.retentionCleanup('client', {...retention(), componentId: component.id});

            expect(await db.query.plays.findFirst({where: {id: row.id}})).eq(undefined);
            expect(await db.select().from(playInputs).where(eq(playInputs.playId, row.id))).length(0);
            expect(await db.select().from(playEvents).where(eq(playEvents.playId, row.id))).length(0);
        });

        it('does not touch queued plays', async function () {
            const {db, repo, component, row} = await seed(40, 'queued');
            await repo.retentionCleanup('client', {...retention(), componentId: component.id});

            const play = await db.query.plays.findFirst({where: {id: row.id}});
            expect(play).not.eq(undefined);
            expect(play?.compacted).eq(null);
        });
    });

    describe('compactPlays', function () {

        it('compacts the given plays regardless of age', async function () {
            const {db, repo, row} = await seed(0);
            await repo.compactPlays([row.id], ['transform']);

            expect((await db.query.plays.findFirst({where: {id: row.id}}))?.compacted).eq('transform');
            expect((await db.query.playInputs.findFirst({where: {playId: row.id}}))?.data).eql({raw: true});
            expect(((await db.query.playEvents.findFirst({where: {playId: row.id}}))?.data as typeof transformData)[0].inputs[0].input).eq('Removed by compaction');
        });

        it('does nothing without ids', async function () {
            const {db, repo, row} = await seed(0);
            await repo.compactPlays([], ['input']);
            expect((await db.query.plays.findFirst({where: {id: row.id}}))?.compacted).eq(null);
        });
    });
});
