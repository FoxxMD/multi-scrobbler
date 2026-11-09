import { describe, it, afterEach, beforeEach } from 'mocha';
import { loggerTest } from "@foxxmd/logging";
import { expect } from 'chai';
import EventEmitter from "events";
import sinon from 'sinon';
import clone from 'clone';
import { SimpleIntervalJob } from 'toad-scheduler';
import SpotifySource, { parseSpotifyPlaylistId } from "../../sources/SpotifySource.ts";
import { envSchemas, type SpotifySourceConfig } from "../../common/infrastructure/config/source/spotify.ts";
import currentlyPlayingNoIsrcPayload from '../plays/spotifyCurrentlyPlayingNoIsrc.json' with { type: "json" };
import playbackState from '../plays/spotifyCurrentPlaybackState.json' with { type: "json" };
import { creditIsrc } from '../../../core/MusicMetadata.ts';

const createSpotifySource = (options: SpotifySourceConfig['options'] = {}): SpotifySource => {
    const config = {
        id: `test-${Date.now()}-${Math.random()}`,
        data: {
            clientId: 'test-client',
            clientSecret: 'test-secret',
        },
        options
    } as unknown as SpotifySourceConfig;

    return new SpotifySource('test', config, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
}

const createSpotifySourceWithData = (data: Partial<SpotifySourceConfig['data']>, options: SpotifySourceConfig['options'] = {}): SpotifySource => {
    const config = {
        id: `test-${Date.now()}-${Math.random()}`,
        data: {
            clientId: 'test-client',
            clientSecret: 'test-secret',
            ...data,
        },
        options
    } as unknown as SpotifySourceConfig;

    return new SpotifySource('test', config, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
}

describe('Spotify - ISRC Enrichment', function () {

    afterEach(function () {
        sinon.restore();
    });

    it('Backfills ISRC from the tracks endpoint when currently-playing omits it', async function () {
        const payload = clone(currentlyPlayingNoIsrcPayload);
        payload.item.id = 'track-backfill';

        const source = createSpotifySource();
        const getTrackStub = sinon.stub().resolves({ body: { external_ids: { isrc: 'USRC17607839' } } });
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
            getTrack: getTrackStub,
        };

        const play = await source.getNowPlaying();

        expect(creditIsrc(play?.data.track)).to.equal('USRC17607839');
        expect(getTrackStub.calledOnceWith('track-backfill')).to.be.true;
    });

    it('Does not re-fetch ISRC for the same track while it is still playing', async function () {
        const payload = clone(currentlyPlayingNoIsrcPayload);
        payload.item.id = 'track-cached';

        const source = createSpotifySource();
        const getTrackStub = sinon.stub().resolves({ body: { external_ids: { isrc: 'USRC17607840' } } });
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
            getTrack: getTrackStub,
        };

        const first = await source.getNowPlaying();
        const second = await source.getNowPlaying();

        expect(creditIsrc(first?.data.track)).to.equal('USRC17607840');
        expect(creditIsrc(second?.data.track)).to.equal('USRC17607840');
        expect(getTrackStub.callCount).to.equal(1);
    });

    it('Does not call the tracks endpoint when enrichIsrc is disabled', async function () {
        const payload = clone(currentlyPlayingNoIsrcPayload);
        payload.item.id = 'track-disabled';

        const source = createSpotifySource({ enrichIsrc: false });
        const getTrackStub = sinon.stub();
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
            getTrack: getTrackStub,
        };

        const play = await source.getNowPlaying();

        expect(creditIsrc(play?.data.track)).to.be.undefined;
        expect(getTrackStub.called).to.be.false;
    });

    it('Does not call tracks endpoint when ISRC is already present', async function () {
        const payload = clone(playbackState);
        payload.item.id = 'playbackTest';

        const source = createSpotifySource();
        const getTrackStub = sinon.stub().resolves({ body: { external_ids: { isrc: 'USRC17607839' } } });
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
            getTrack: getTrackStub,
        };

        const play = await source.getNowPlaying();

        expect(creditIsrc(play?.data.track)).to.equal('FR9W12915571');
        expect(getTrackStub.called).to.be.false;
    });

    it('Leaves the play scrobbleable when the backfill call fails', async function () {
        const payload = clone(currentlyPlayingNoIsrcPayload);
        payload.item.id = 'track-errors';

        const source = createSpotifySource();
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
            getTrack: sinon.stub().rejects(new Error('Spotify tracks endpoint unavailable')),
        };

        const play = await source.getNowPlaying();

        expect(play).to.not.be.undefined;
        expect(creditIsrc(play?.data.track)).to.be.undefined;
        expect(play?.data.track?.name).to.equal('The Sandpits Of Zonhoven');
    });
});

describe('Spotify - Backlog Reconcile Task', function () {

    beforeEach(function () {
        // initTasks also adds the Heartbeat task which runs immediately and would call the real Spotify API
        sinon.stub(SpotifySource.prototype as any, 'heartbeatTask').resolves(true);
    });

    afterEach(function () {
        sinon.restore();
    });

    it('adds reconcile task to scheduler by default with 15 minute interval', function () {
        using source = createSpotifySource();
        source.initTasks();

        expect(source.scheduler.existsById('reconcile')).to.be.true;
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        expect((job as any).schedule).to.deep.equal({ minutes: 15, runImmediately: false });
    });

    it('adds reconcile task when scrobbleBacklog is explicitly true', function () {
        using source = createSpotifySource({ scrobbleBacklog: true });
        source.initTasks();

        expect(source.scheduler.existsById('reconcile')).to.be.true;
    });

    it('does not add reconcile task when scrobbleBacklog is false', function () {
        using source = createSpotifySource({ scrobbleBacklog: false });
        source.initTasks();

        expect(source.scheduler.existsById('reconcile')).to.be.false;
    });

    it('does not add duplicate task if initTasks is called again', function () {
        using source = createSpotifySource();
        source.initTasks();
        source.initTasks();

        expect(source.scheduler.getAllJobs().filter(j => j.id === 'reconcile')).to.have.lengthOf(1);
    });

    it('reconcile task executes processBacklog with Reconcile label when source is ready', async function () {
        using source = createSpotifySource();
        const processStub = sinon.stub(source as any, 'processBacklog').resolves();
        sinon.stub(source, 'isReady').returns(true);

        source.initTasks();
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        await (job as any).task.executeAsync();

        expect(processStub.calledOnce).to.be.true;
        expect(processStub.firstCall.args[1]).to.equal('Reconcile');
    });

    it('reconcile task does not execute processBacklog when source is not ready', async function () {
        using source = createSpotifySource();
        const processStub = sinon.stub(source as any, 'processBacklog').resolves();
        sinon.stub(source, 'isReady').returns(false);

        source.initTasks();
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        await (job as any).task.executeAsync();

        expect(processStub.called).to.be.false;
    });

    it('reconcile task pushes to errors when processBacklog fails', async function () {
        using source = createSpotifySource();
        const error = new Error('Spotify API error');
        sinon.stub(source as any, 'processBacklog').rejects(error);
        sinon.stub(source, 'isReady').returns(true);

        source.initTasks();
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        await (job as any).task.executeAsync();

        expect(source.errors).to.include(error);
    });
});

describe('Spotify - Configuration', function () {

    it('Parses SPOTIFY_SCROBBLE_BACKLOG from ENV', function () {
        const parsed = envSchemas.toConfig({
            SPOTIFY_CLIENT_ID: 'cid',
            SPOTIFY_CLIENT_SECRET: 'csec',
            SPOTIFY_REDIRECT_URI: 'http://localhost/callback',
            SPOTIFY_SCROBBLE_BACKLOG: false,
        });

        expect(parsed.options?.scrobbleBacklog).to.be.false;
    });
});


describe('Spotify - Playlist Blocking', function () {

    const blockedId = 'abcdefghijklmnopqrstuv';
    const playlistContext = (id: string) => ({
        type: 'playlist',
        uri: `spotify:playlist:${id}`,
        href: `https://api.spotify.com/v1/playlists/${id}`,
        external_urls: { spotify: `https://open.spotify.com/playlist/${id}` }
    });

    afterEach(function () {
        sinon.restore();
    });

    it('Parses playlist IDs from IDs, URIs and share URLs', function () {
        expect(parseSpotifyPlaylistId(blockedId)).to.equal(blockedId);
        expect(parseSpotifyPlaylistId(` spotify:playlist:${blockedId} `)).to.equal(blockedId);
        expect(parseSpotifyPlaylistId(`spotify:user:someone:playlist:${blockedId}`)).to.equal(blockedId);
        expect(parseSpotifyPlaylistId(`https://open.spotify.com/playlist/${blockedId}?si=abc123`)).to.equal(blockedId);
        expect(parseSpotifyPlaylistId(`https://open.spotify.com/intl-de/playlist/${blockedId}`)).to.equal(blockedId);
        expect(parseSpotifyPlaylistId('spotify:album:4r9HEszOAbfhRfT1n1QPLF')).to.be.undefined;
        expect(parseSpotifyPlaylistId('My Sleep Playlist')).to.be.undefined;
        expect(parseSpotifyPlaylistId('sleep')).to.be.undefined;
    });

    it('Parses SPOTIFY_PLAYLISTS_BLOCK from ENV as a list', function () {
        const parsed = envSchemas.env.parse({
            SPOTIFY_CLIENT_ID: 'cid',
            SPOTIFY_CLIENT_SECRET: 'csec',
            SPOTIFY_PLAYLISTS_BLOCK: `${blockedId}, spotify:playlist:abc`,
        });
        const config = envSchemas.toConfig(parsed);

        expect(config.data?.playlistsBlock).to.deep.equal([blockedId, 'spotify:playlist:abc']);
    });

    it('Only blocks playlist contexts that are in the block list', function () {
        const source = createSpotifySourceWithData({ playlistsBlock: [`https://open.spotify.com/playlist/${blockedId}?si=xyz`, 'not a playlist'] });

        expect(source.isFromBlockedPlaylist(playlistContext(blockedId) as SpotifyApi.ContextObject)).to.be.true;
        expect(source.isFromBlockedPlaylist(playlistContext('somethingElse') as SpotifyApi.ContextObject)).to.be.false;
        expect(source.isFromBlockedPlaylist(playbackState.context as SpotifyApi.ContextObject)).to.be.false;
        expect(source.isFromBlockedPlaylist(null)).to.be.false;
        expect(source.isFromBlockedPlaylist(undefined)).to.be.false;
    });

    it('Blocks nothing when playlistsBlock is not set', function () {
        const source = createSpotifySource();
        expect(source.isFromBlockedPlaylist(playlistContext(blockedId) as SpotifyApi.ContextObject)).to.be.false;
    });

    it('Does not track player state when playing from a blocked playlist', async function () {
        const source = createSpotifySourceWithData({ playlistsBlock: blockedId }, { enrichIsrc: false });
        source.canGetState = true;
        const payload = clone(playbackState);
        payload.context = playlistContext(blockedId);
        (source as any).spotifyApi = {
            getMyCurrentPlaybackState: sinon.stub().resolves({ body: payload }),
        };
        const processStub = sinon.stub(source as any, 'processRecentPlays').resolves([]);

        await source.getRecentlyPlayed();

        expect(processStub.calledOnce).to.be.true;
        expect(processStub.firstCall.args[0]).to.have.lengthOf(0);
    });

    it('Tracks player state when playing from a playlist that is not blocked', async function () {
        const source = createSpotifySourceWithData({ playlistsBlock: blockedId }, { enrichIsrc: false });
        source.canGetState = true;
        const payload = clone(playbackState);
        payload.context = playlistContext('somethingElse');
        (source as any).spotifyApi = {
            getMyCurrentPlaybackState: sinon.stub().resolves({ body: payload }),
        };
        const processStub = sinon.stub(source as any, 'processRecentPlays').resolves([]);

        await source.getRecentlyPlayed();

        expect(processStub.firstCall.args[0]).to.have.lengthOf(1);
    });

    it('Does not return now playing when playing from a blocked playlist', async function () {
        const source = createSpotifySourceWithData({ playlistsBlock: blockedId }, { enrichIsrc: false });
        const payload = clone(currentlyPlayingNoIsrcPayload);
        payload.context = playlistContext(blockedId);
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
        };

        expect(await source.getNowPlaying()).to.be.undefined;
    });

    it('Drops history plays from a blocked playlist without ending pagination early', async function () {
        const source = createSpotifySourceWithData({ playlistsBlock: blockedId });
        const track = clone(currentlyPlayingNoIsrcPayload.item);
        const items = [
            { track: clone(track), played_at: '2026-11-07T03:00:00.000Z', context: playlistContext(blockedId) },
            { track: clone(track), played_at: '2026-11-07T03:05:00.000Z', context: playlistContext('somethingElse') },
            { track: clone(track), played_at: '2026-11-07T03:10:00.000Z', context: null },
        ];
        (source as any).spotifyApi = {
            getMyRecentlyPlayedTracks: sinon.stub().resolves({ body: { items, next: 'next-page', cursors: { after: '123', before: '100' }, total: 3, limit: 3 } }),
        };

        const result = await source.getPaginatedTimeRangeListens({ limit: 3, from: 0 } as any);

        expect(result.data).to.have.lengthOf(2);
        expect(result.data.map(x => x.data.playDate?.toISOString())).to.deep.equal(['2026-11-07T03:05:00.000Z', '2026-11-07T03:10:00.000Z']);
        expect(result.meta.more).to.be.true;
    });
});
