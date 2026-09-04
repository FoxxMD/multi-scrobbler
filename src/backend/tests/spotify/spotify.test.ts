import { describe, it, afterEach } from 'mocha';
import { loggerTest } from "@foxxmd/logging";
import { expect } from 'chai';
import EventEmitter from "events";
import sinon from 'sinon';
import clone from 'clone';
import SpotifySource from "../../sources/SpotifySource.ts";
import type { SpotifySourceConfig } from "../../common/infrastructure/config/source/spotify.ts";
import currentlyPlayingNoIsrcPayload from '../plays/spotifyCurrentlyPlayingNoIsrc.json' with { type: "json" };

const createSpotifySource = (enrichIsrc?: boolean): SpotifySource => {
    const config = {
        id: `test-${Date.now()}-${Math.random()}`,
        data: {
            clientId: 'test-client',
            clientSecret: 'test-secret',
            enrichIsrc,
        },
        options: {}
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

        expect(play?.data.isrc).to.equal('USRC17607839');
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

        expect(first?.data.isrc).to.equal('USRC17607840');
        expect(second?.data.isrc).to.equal('USRC17607840');
        expect(getTrackStub.callCount).to.equal(1);
    });

    it('Does not call the tracks endpoint when enrichIsrc is disabled', async function () {
        const payload = clone(currentlyPlayingNoIsrcPayload);
        payload.item.id = 'track-disabled';

        const source = createSpotifySource(false);
        const getTrackStub = sinon.stub();
        (source as any).spotifyApi = {
            getMyCurrentPlayingTrack: sinon.stub().resolves({ body: payload }),
            getTrack: getTrackStub,
        };

        const play = await source.getNowPlaying();

        expect(play?.data.isrc).to.be.undefined;
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
        expect(play?.data.isrc).to.be.undefined;
        expect(play?.data.track).to.equal('The Sandpits Of Zonhoven');
    });
});
