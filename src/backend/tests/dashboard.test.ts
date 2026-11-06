import { expect } from 'chai';
import dayjs from 'dayjs';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from './utils/TransientTestUtils.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from './utils/databaseFixtures.ts';
import { generatePlay } from '../../core/tests/utils/PlayTestUtils.ts';
import { ensureOwner } from '../common/auth/owner.ts';
import { getUserSettings, setUserSetting } from '../common/auth/userSettings.ts';
import { buildPublicDashboard, getNowPlayingOptions, getPublicDashboard, invalidateDashboardCache, type DashboardComponents, type NowPlayingClient, type NowPlayingSource } from '../common/dashboard.ts';
import type { SourcePlayerObj } from '../../core/Atomic.ts';
import { components, plays } from '../common/database/drizzle/schema/schema.ts';
import { up as listenedMigration } from '../common/database/appMigrations/008_listenedCounter.ts';
import { buildAuthApp, secureApp, signIn } from './utils/authTestUtils.ts';

const comps = {sources: [{type: 'jellyfin'}, {type: 'jellyfin'}, {type: 'spotify'}], clients: [{type: 'lastfm'}]};

const fakePlayer = (platformId: string, track: string, status: Partial<SourcePlayerObj['status']> = {}) => ({
    getApiState: (): SourcePlayerObj => ({
        platformId,
        play: generatePlay({track: {name: track}}),
        playerLastUpdatedAt: dayjs().toISOString(),
        listenedDuration: 0,
        status: {reported: 'playing', calculated: 'playing', stale: false, orphaned: false, ...status},
    })
});

const fakeSource = (type: string, uid: string, players: ReturnType<typeof fakePlayer>[], monitoring = true): NowPlayingSource => ({
    type,
    getUid: () => uid,
    isMonitoring: () => monitoring,
    players: new Map(players.map((x, i) => [String(i), x])),
});

const fakeClient = (type: string, uid: string, track?: string, opts: {expiration?: string, enabled?: boolean} = {}): NowPlayingClient => ({
    type,
    getUid: () => uid,
    supportsNowPlaying: true,
    nowPlayingEnabled: opts.enabled ?? true,
    nowPlayingLastSource: {type: 'jellyfin'},
    getNowPlayingPlayers: (): ReturnType<NowPlayingClient['getNowPlayingPlayers']> => track === undefined ? {} : {
        'user-device': {...(fakePlayer('user-device', track).getApiState() as any), expiration: opts.expiration}
    },
});

/** build without the cache, which is kept at least MIN_DASHBOARD_TTL even with refresh: true */
const build = async (db: Awaited<ReturnType<typeof setup>>['db'], userId: string, comps: DashboardComponents) => buildPublicDashboard(db, userId, comps, await getUserSettings(db, userId));

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
        // type of the source component that discovered it, never the play's own meta.source (sometimes a component name)
        expect(recent?.map(x => x.meta.source)).eql(['jellyfin', 'jellyfin']);
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
        // refresh: true is still cached for MIN_DASHBOARD_TTL
        await db.update(components).set({countLive: 12}).where(eq(components.id, source.id));
        expect((await getPublicDashboard(db, owner.id, comps)).plays).eq(11);
        invalidateDashboardCache(owner.id);
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

    describe('Now Playing from Sources', function () {

        const enableNowPlaying = async (db: Awaited<ReturnType<typeof setup>>['db'], userId: string, nowPlaying: object) => {
            await setUserSetting(db, userId, 'publicDashboardEnabled', true);
            await setUserSetting(db, userId, 'publicDashboardSettings', {nowPlaying, refresh: true} as any);
        }

        it('is undefined when not enabled and null when nothing is playing', async function () {
            const {db, owner} = await setup();
            await setUserSetting(db, owner.id, 'publicDashboardEnabled', true);
            await setUserSetting(db, owner.id, 'publicDashboardSettings', {listenStats: true, refresh: true});
            const sources = [fakeSource('jellyfin', 'a', [fakePlayer('p1', 'Song A')])];
            expect(await build(db, owner.id, {sources, clients: []})).to.not.have.property('nowPlaying');

            await enableNowPlaying(db, owner.id, {from: 'anySource'});
            expect((await build(db, owner.id, {sources: [fakeSource('jellyfin', 'a', [])], clients: []})).nowPlaying).eq(null);
        });

        it('only shows playing players from monitoring sources', async function () {
            const {db, owner} = await setup();
            await enableNowPlaying(db, owner.id, {from: 'anySource'});
            const sources = [
                fakeSource('jellyfin', 'a', [
                    fakePlayer('p1', 'Paused', {calculated: 'paused'}),
                    fakePlayer('p2', 'Stale', {stale: true}),
                    fakePlayer('p3', 'Orphaned', {orphaned: true}),
                ]),
                fakeSource('plex', 'b', [fakePlayer('p1', 'Not Monitored')], false),
                {type: 'lastfm'},
            ];
            expect((await build(db, owner.id, {sources, clients: []})).nowPlaying).eq(null);
        });

        it('strips private data and shows the source type, not its name', async function () {
            const {db, owner} = await setup();
            await enableNowPlaying(db, owner.id, {from: 'anySource'});
            const {nowPlaying} = await build(db, owner.id, {sources: [fakeSource('jellyfin', 'My Home Server', [fakePlayer('user-device', 'Song A')])], clients: []});
            expect(nowPlaying?.data.track?.name).eq('Song A');
            expect(nowPlaying?.meta.source).eq('jellyfin');
            expect(nowPlaying).to.not.have.nested.property('data.playDate');
            expect(JSON.stringify(nowPlaying)).to.not.include('user-device').and.not.include('My Home Server');
        });

        it('only keeps http(s) play urls', async function () {
            const {db, owner} = await setup();
            await enableNowPlaying(db, owner.id, {from: 'anySource'});
            const player = (url: {web?: string, origin?: string}) => {
                const p = fakePlayer('p1', 'Song A');
                return {getApiState: () => {
                    const state = p.getApiState();
                    state.play!.meta.url = url;
                    return state;
                }};
            };
            const nowPlaying = async (url: {web?: string, origin?: string}) => (await build(db, owner.id, {sources: [fakeSource('jellyfin', 'a', [player(url)])], clients: []})).nowPlaying;
            expect((await nowPlaying({web: 'https://open.spotify.com/track/1', origin: 'http://youtube.com/watch'}))?.meta.url).eql({web: 'https://open.spotify.com/track/1', origin: 'http://youtube.com/watch'});
            expect((await nowPlaying({web: 'javascript:alert(1)', origin: 'https://ok.example'}))?.meta.url).eql({web: undefined, origin: 'https://ok.example'});
            expect((await nowPlaying({web: 'data:text/html,hi', origin: '/relative'}))?.meta.url).eq(undefined);
        });

        it('only uses the configured source', async function () {
            const {db, owner} = await setup();
            const sources = [fakeSource('jellyfin', 'a', [fakePlayer('p1', 'Song A')]), fakeSource('plex', 'b', [fakePlayer('p1', 'Song B')])];
            await enableNowPlaying(db, owner.id, {from: 'source', uid: 'b'});
            expect((await build(db, owner.id, {sources, clients: []})).nowPlaying?.data.track?.name).eq('Song B');

            await enableNowPlaying(db, owner.id, {from: 'source', uid: 'removed'});
            expect((await build(db, owner.id, {sources, clients: []})).nowPlaying).eq(null);
        });

        it('sticks with the shown player while it keeps playing', async function () {
            const {db, owner} = await setup();
            await enableNowPlaying(db, owner.id, {from: 'anySource'});
            const later = fakePlayer('p2', 'Song B');
            const first = await build(db, owner.id, {sources: [fakeSource('jellyfin', 'a', [later])], clients: []});
            expect(first.nowPlaying?.data.track?.name).eq('Song B');

            // p1 sorts first but p2 is already shown
            const sources = [fakeSource('jellyfin', 'a', [fakePlayer('p1', 'Song A'), later])];
            for (let i = 0; i < 3; i++) {
                expect((await build(db, owner.id, {sources, clients: []})).nowPlaying?.data.track?.name).eq('Song B');
            }

            // p2 stops, falls back to the deterministic pick
            const stopped = [fakeSource('jellyfin', 'a', [fakePlayer('p1', 'Song A'), fakePlayer('p2', 'Song B', {calculated: 'stopped'})])];
            expect((await build(db, owner.id, {sources: stopped, clients: []})).nowPlaying?.data.track?.name).eq('Song A');
        });
    });

    describe('Now Playing from a client', function () {

        const enableNowPlaying = async (db: Awaited<ReturnType<typeof setup>>['db'], userId: string, uid: string) => {
            await setUserSetting(db, userId, 'publicDashboardEnabled', true);
            await setUserSetting(db, userId, 'publicDashboardSettings', {nowPlaying: {from: 'client', uid}, refresh: true});
        }

        it('mirrors the client Now Playing with the source type', async function () {
            const {db, owner} = await setup();
            await enableNowPlaying(db, owner.id, 'b');
            const clients = [fakeClient('lastfm', 'a', 'Song A'), fakeClient('discord', 'b', 'Song B')];
            const sources = [fakeSource('plex', 'p', [fakePlayer('p1', 'Source Song')])];
            const {nowPlaying} = await build(db, owner.id, {sources, clients});
            expect(nowPlaying?.data.track?.name).eq('Song B');
            expect(nowPlaying?.meta.source).eq('jellyfin');
            expect(JSON.stringify(nowPlaying)).to.not.include('user-device').and.not.include('expiration');
        });

        it('is null when nothing is playing, it expired upstream, or the client cannot report it', async function () {
            const {db, owner} = await setup();
            await enableNowPlaying(db, owner.id, 'a');
            expect((await build(db, owner.id, {sources: [], clients: [fakeClient('lastfm', 'a')]})).nowPlaying).eq(null);
            expect((await build(db, owner.id, {sources: [], clients: [fakeClient('lastfm', 'a', 'Song A', {expiration: dayjs().subtract(1, 's').toISOString()})]})).nowPlaying).eq(null);
            expect((await build(db, owner.id, {sources: [], clients: [fakeClient('lastfm', 'a', 'Song A', {expiration: dayjs().add(1, 'm').toISOString()})]})).nowPlaying?.data.track?.name).eq('Song A');
            expect((await build(db, owner.id, {sources: [], clients: [fakeClient('lastfm', 'a', 'Song A', {enabled: false})]})).nowPlaying).eq(null);
            expect((await build(db, owner.id, {sources: [], clients: [fakeClient('lastfm', 'removed', 'Song A')]})).nowPlaying).eq(null);
        });

        it('lists sources with players and clients with Now Playing enabled as options', function () {
            const options = getNowPlayingOptions({
                sources: [{...fakeSource('plex', 'p', []), name: 'My Plex'}, {type: 'lastfm', name: 'history'}],
                clients: [fakeClient('lastfm', 'a'), fakeClient('discord', 'b', undefined, {enabled: false}), {type: 'maloja'}],
            });
            expect(options).eql([
                {from: 'source', uid: 'p', name: 'My Plex', type: 'plex'},
                {from: 'client', uid: 'a', name: 'a', type: 'lastfm'},
            ]);
        });
    });

    it('is cacheable and answers a matching ETag with 304', async function () {
        const app = await buildAuthApp();
        const res = await request(app).get('/api/dashboard');
        expect(res.headers['cache-control']).match(/^public, max-age=\d+$/);
        expect(res.headers.etag).to.not.eq(undefined);
        const cached = await request(app).get('/api/dashboard').set('If-None-Match', res.headers.etag);
        expect(cached.status).eq(304);
    });

    it('only lists Now Playing options for a logged in user', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        expect((await request(app).get('/api/dashboard/now-playing-options')).status).eq(401);
        const cookie = await signIn(app);
        const res = await request(app).get('/api/dashboard/now-playing-options').set('Cookie', cookie);
        expect(res.status).eq(200);
        expect(res.body).eql([]);
    });

    it('is served without auth', async function () {
        const app = await buildAuthApp();
        const res = await request(app).get('/api/dashboard');
        expect(res.status).eq(200);
        expect(res.body).eql({});
    });
});
