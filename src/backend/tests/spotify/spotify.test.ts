import { describe, it, afterEach } from 'mocha';
import { loggerTest } from "@foxxmd/logging";
import { expect } from 'chai';
import EventEmitter from "events";
import sinon from 'sinon';
import clone from 'clone';
import { SimpleIntervalJob } from 'toad-scheduler';
import SpotifySource from "../../sources/SpotifySource.ts";
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

    afterEach(function () {
        sinon.restore();
    });

    it('adds reconcile task to scheduler by default with 15 minute interval', function () {
        const source = createSpotifySource();
        source.initTasks();

        expect(source.scheduler.existsById('reconcile')).to.be.true;
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        expect((job as any).schedule).to.deep.equal({ minutes: 15, runImmediately: false });
    });

    it('adds reconcile task when scrobbleBacklog is explicitly true', function () {
        const source = createSpotifySource({ scrobbleBacklog: true });
        source.initTasks();

        expect(source.scheduler.existsById('reconcile')).to.be.true;
    });

    it('does not add reconcile task when scrobbleBacklog is false', function () {
        const source = createSpotifySource({ scrobbleBacklog: false });
        source.initTasks();

        expect(source.scheduler.existsById('reconcile')).to.be.false;
    });

    it('does not add duplicate task if initTasks is called again', function () {
        const source = createSpotifySource();
        source.initTasks();
        source.initTasks();

        expect(source.scheduler.getAllJobs().filter(j => j.id === 'reconcile')).to.have.lengthOf(1);
    });

    it('reconcile task executes processBacklog with Reconcile label when source is ready', async function () {
        const source = createSpotifySource();
        const processStub = sinon.stub(source as any, 'processBacklog').resolves();
        sinon.stub(source, 'isReady').returns(true);

        source.initTasks();
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        await (job as any).task.executeAsync();

        expect(processStub.calledOnce).to.be.true;
        expect(processStub.firstCall.args[1]).to.equal('Reconcile');
    });

    it('reconcile task does not execute processBacklog when source is not ready', async function () {
        const source = createSpotifySource();
        const processStub = sinon.stub(source as any, 'processBacklog').resolves();
        sinon.stub(source, 'isReady').returns(false);

        source.initTasks();
        const job = source.scheduler.getById('reconcile') as SimpleIntervalJob;
        await (job as any).task.executeAsync();

        expect(processStub.called).to.be.false;
    });

    it('reconcile task pushes to errors when processBacklog fails', async function () {
        const source = createSpotifySource();
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

