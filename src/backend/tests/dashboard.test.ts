import { expect } from 'chai';
import dayjs from 'dayjs';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from './utils/TransientTestUtils.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from './utils/databaseFixtures.ts';
import { generatePlay } from '../../core/tests/utils/PlayTestUtils.ts';
import { ensureOwner } from '../common/auth/owner.ts';
import { setUserSetting } from '../common/auth/userSettings.ts';
import { getPublicDashboard } from '../common/dashboard.ts';
import { components, plays } from '../common/database/drizzle/schema/schema.ts';
import { up as listenedMigration } from '../common/database/appMigrations/008_listenedCounter.ts';
import { buildAuthApp } from './utils/authTestUtils.ts';

const comps = {sources: [{type: 'jellyfin'}, {type: 'jellyfin'}, {type: 'spotify'}], clients: [{type: 'lastfm'}]};

const setup = async () => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const [source] = await db.insert(components).values(fixtureCreateComponent({userId: owner.id, countLive: 10, listenedLive: 600})).returning();
    const [client] = await db.insert(components).values(fixtureCreateComponent({userId: owner.id, mode: 'client', type: 'lastfm', uid: 'c', countLive: 7})).returning();
    return {db, owner, source, client};
}

describe('Public Dashboard', function () {

    it('is empty when not enabled', async function () {
        const {db, owner} = await setup();
        expect(await getPublicDashboard(db, owner.id, comps)).eql({});
        await setUserSetting(db, owner.id, 'publicDashboardSettings', {listenStats: true, refresh: true});
        expect(await getPublicDashboard(db, owner.id, comps)).eql({});
        await setUserSetting(db, owner.id, 'publicDashboardEnabled', false);
        expect(await getPublicDashboard(db, owner.id, comps)).eql({});
    });

    it('includes only enabled data', async function () {
        const {db, owner} = await setup();
        await setUserSetting(db, owner.id, 'publicDashboardEnabled', true);
        await setUserSetting(db, owner.id, 'publicDashboardSettings', {sources: 'detailed', clients: 'count', refresh: true});
        expect(await getPublicDashboard(db, owner.id, comps)).eql({
            sources: {count: 3, types: ['jellyfin', 'spotify']},
            clients: {count: 1},
        });

        await setUserSetting(db, owner.id, 'publicDashboardSettings', {listenStats: true, refresh: true});
        expect(await getPublicDashboard(db, owner.id, comps)).eql({plays: 10, scrobbles: 7, listened: 600});
    });

    it('returns recent plays unique by their discovered play', async function () {
        const {db, owner, source, client} = await setup();
        await setUserSetting(db, owner.id, 'publicDashboardEnabled', true);
        await setUserSetting(db, owner.id, 'publicDashboardSettings', {recent: 2, refresh: true});

        const discovered = [];
        for (const minutes of [30, 20, 10]) {
            const [d] = await db.insert(plays).values(fixtureCreatePlay({componentId: source.id, state: 'discovered', play: generatePlay({playDate: dayjs().subtract(minutes, 'minutes')})})).returning();
            discovered.push(d);
            // same discovered play scrobbled twice (ie to two clients)
            for (let i = 0; i < 2; i++) {
                await db.insert(plays).values(fixtureCreatePlay({componentId: client.id, state: 'scrobbled', parentId: d.id, play: d.play}));
            }
        }

        const {recent} = await getPublicDashboard(db, owner.id, comps);
        expect(recent?.map(x => x.data.track?.name)).eql([discovered[2].play.data.track?.name, discovered[1].play.data.track?.name]);
        expect(recent?.[0]).to.not.have.nested.property('data.playDate');
    });

    it('caches for refresh seconds and rebuilds when settings change', async function () {
        const {db, owner, source} = await setup();
        await setUserSetting(db, owner.id, 'publicDashboardEnabled', true);
        await setUserSetting(db, owner.id, 'publicDashboardSettings', {listenStats: true, refresh: 60});
        expect((await getPublicDashboard(db, owner.id, comps)).plays).eq(10);

        await db.update(components).set({countLive: 11}).where(eq(components.id, source.id));
        expect((await getPublicDashboard(db, owner.id, comps)).plays).eq(10);

        await setUserSetting(db, owner.id, 'publicDashboardSettings', {listenStats: true, refresh: true});
        expect((await getPublicDashboard(db, owner.id, comps)).plays).eq(11);
        await db.update(components).set({countLive: 12}).where(eq(components.id, source.id));
        expect((await getPublicDashboard(db, owner.id, comps)).plays).eq(12);
    });

    it('backfills listened from discovered plays', async function () {
        const {db, source, client} = await setup();
        await db.insert(plays).values([
            fixtureCreatePlay({componentId: source.id, state: 'discovered', play: generatePlay({listenedFor: 100, duration: 200})}),
            fixtureCreatePlay({componentId: source.id, state: 'discovered', play: generatePlay({duration: 50, listenedFor: undefined})}),
            fixtureCreatePlay({componentId: source.id, state: 'duped', play: generatePlay({duration: 1000})}),
            fixtureCreatePlay({componentId: client.id, state: 'scrobbled', play: generatePlay({duration: 1000})}),
        ]);
        await listenedMigration(db.$client as any, {db, logger: loggerTest});
        const rows = await db.select().from(components);
        expect(rows.find(x => x.id === source.id)?.listenedLive).eq(150);
        expect(rows.find(x => x.id === client.id)?.listenedLive).eq(0);
    });

    it('is served without auth', async function () {
        const app = await buildAuthApp();
        const res = await request(app).get('/api/dashboard');
        expect(res.status).eq(200);
        expect(res.body).eql({});
    });
});
