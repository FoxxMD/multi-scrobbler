import { expect } from 'chai';
import { drizzle } from 'drizzle-orm/node-sqlite';
import type { DatabaseSync } from 'node:sqlite';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { migrateDb, type DbConcrete } from '../../common/database/drizzle/drizzleUtils.ts';
import { DrizzlePlayRepository } from '../../common/database/drizzle/repositories/PlayRepository.ts';
import { DrizzleQueueRepository } from '../../common/database/drizzle/repositories/QueueRepository.ts';
import { JobTargetRepository } from '../../common/database/drizzle/repositories/JobTargetRepository.ts';
import { components, plays, queueStates, relations } from '../../common/database/drizzle/schema/schema.ts';
import type { QueueStateSelect } from '../../common/database/drizzle/drizzleTypes.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';

const loggedDb = async () => {
    const queries: {sql: string, params: unknown[]}[] = [];
    const db = drizzle(':memory:', {relations, logger: {logQuery: (q, params) => { queries.push({sql: q, params}); }}}) as unknown as DbConcrete;
    await migrateDb(db);
    return {db, queries};
}

const seed = async (db: DbConcrete) => {
    const [a] = await db.insert(components).values(fixtureCreateComponent({uid: 'a', mode: 'client'})).returning();
    const [b] = await db.insert(components).values(fixtureCreateComponent({uid: 'b', mode: 'client'})).returning();
    const addPlay = async (componentId: number, queueStatus: QueueStateSelect['queueStatus'], retries = 0) => {
        const [row] = await db.insert(plays).values(fixtureCreatePlay({componentId, state: queueStatus === 'completed' ? 'scrobbled' : 'queued'})).returning();
        await db.insert(queueStates).values({playId: row.id, componentId, queueName: 'ingress', queueStatus, retries});
        return row;
    }
    return {a, b, addPlay};
}

/** Query plan of the first query `fn` runs */
const planOf = async (db: DbConcrete, queries: {sql: string, params: unknown[]}[], fn: () => Promise<unknown>): Promise<string> => {
    queries.length = 0;
    await fn();
    const {sql, params} = queries[0];
    const client = (db as unknown as {$client: DatabaseSync}).$client;
    const rows = client.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params as (string | number | null)[])) as {detail: string}[];
    return rows.map(x => x.detail).join('\n');
}

describe('Play queue queries', function () {

    it('find only queued plays of the component within retries', async function () {
        const {db} = await loggedDb();
        const {a, b, addPlay} = await seed(db);
        await addPlay(a.id, 'completed');
        await addPlay(b.id, 'queued');
        const retried = await addPlay(a.id, 'queued', 3);
        const queued = await addPlay(a.id, 'queued');
        const repo = new DrizzlePlayRepository(db, {componentId: a.id});

        expect((await repo.getQueueNext('ingress', {retries: 0}))?.id).eq(queued.id);
        expect((await repo.getQueueNext('ingress', {retries: 0, notIds: [queued.id]}))).undefined;
        expect((await repo.getQueueNext('ingress', {notIds: [queued.id]}))?.id).eq(retried.id);
        expect((await repo.getQueueNext('dead'))).undefined;
        expect(await repo.hasQueueNext('ingress', 0)).true;
        expect((await repo.getQueuedScrobbleRange('ingress', {retries: 0}))).length(1);
        expect((await repo.getQueued('ingress')).data.map(x => x.id)).have.members([retried.id, queued.id]);
        expect((await repo.getQueued('ingress', {retries: 0})).data.map(x => x.id)).eql([queued.id]);
    });

    it('use indexes instead of reading every play of the component', async function () {
        const {db, queries} = await loggedDb();
        const {a, addPlay} = await seed(db);
        await addPlay(a.id, 'queued');
        const repo = new DrizzlePlayRepository(db, {componentId: a.id});
        const probe = generatePlay();

        const plans = {
            getQueueNext: await planOf(db, queries, () => repo.getQueueNext('ingress')),
            getQueued: await planOf(db, queries, () => repo.getQueued('ingress', {retries: 0})),
            getQueueCount: await planOf(db, queries, () => new DrizzleQueueRepository(db).getQueueCount(a.id, ['ingress'], {queueStatus: ['queued'], retries: 0})),
            checkExisting: await planOf(db, queries, () => repo.checkExisting(probe, {states: ['scrobbled']})),
            getTemporallyClosePlays: await planOf(db, queries, () => repo.getTemporallyClosePlays(probe, {states: ['scrobbled']})),
            playStats: await planOf(db, queries, () => new JobTargetRepository(db).playStats(1, a.id)),
        };
        for (const [name, plan] of Object.entries(plans)) {
            expect(plan, name).not.match(/^SCAN (plays|play_queue_states|d0)\b/m);
        }
        expect(plans.getQueueNext).match(/SEARCH d0 USING INTEGER PRIMARY KEY/);
        expect(plans.getQueueNext).match(/play_queue_state_component_idx/);
        expect(plans.getQueueCount).match(/play_queue_state_component_idx/);
        expect(plans.checkExisting).match(/play_component_played_idx \(componentId=\? AND playedAt>\? AND playedAt<\?\)/);
        expect(plans.getTemporallyClosePlays).match(/play_component_played_idx \(componentId=\? AND playedAt>\? AND playedAt<\?\)/);
        expect(plans.playStats).match(/COVERING INDEX play_job_component_state_idx/);
    });
});
