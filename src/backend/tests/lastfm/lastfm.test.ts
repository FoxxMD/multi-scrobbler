import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import { generateLastfmTrackObject, generateMbid, generatePlay } from "../../../core/tests/utils/PlayTestUtils.ts";

import LastfmApiClient, { playToClientPayload, formatPlayObj } from '../../common/vendor/LastfmApiClient.ts';
import { artistNamesToCredits } from '../../../core/StringUtils.ts';
import { withRequestInterception } from '../utils/networking.ts';
import { http, HttpResponse } from "msw";
import { loggerDebug, loggerTest } from '@foxxmd/logging';
import { findCauseByReference } from '../../utils/ErrorUtils.ts';
import { LastFMResponseError } from 'lastfm-ts-api';
import { SimpleError } from '../../common/errors/MSErrors.ts';
import {spy} from 'sinon';
import { sleep } from '../../utils.ts';

chai.use(asPromised);

describe('#LFM Scrobble Payload Behavior', function () {

        it('Should remove VA from album artist', function() {
            const play = generatePlay({albumArtists: artistNamesToCredits(['VA'])});
            expect(playToClientPayload(play).albumArtist).to.be.undefined;

            const okPlay = generatePlay({albumArtists: artistNamesToCredits(['My Dude'])});
            expect(playToClientPayload(okPlay).albumArtist).eq('My Dude');
        });
});

describe('#LFM Track to Play', function() {

    it('Sets mbids to undefined when values are empty strings', function() {

        const to = generateLastfmTrackObject();
        const play = formatPlayObj(to);

        expect(play.data.meta?.brainz?.album).to.be.undefined;
        expect(play.data.meta?.brainz?.artist).to.be.undefined;
        expect(play.data.meta?.brainz?.recording).to.be.undefined;
    });

    it('Sets brainz if any mbid is not undefined', function() {

        const toAlbum = generateLastfmTrackObject();
        toAlbum.album.mbid = generateMbid();
        expect(formatPlayObj(toAlbum).data.meta?.brainz?.album).to.not.be.undefined;

        const toArtist = generateLastfmTrackObject();
        toArtist.artist.mbid = generateMbid();
        expect(formatPlayObj(toArtist).data.meta?.brainz?.artist).to.not.be.undefined;

        const toTrack = generateLastfmTrackObject();
        toTrack.mbid = generateMbid();
        expect(formatPlayObj(toTrack).data.meta?.brainz?.recording).to.not.be.undefined;
    });

        it('Sets artist correctly from #text or name', function() {

        const toArtText = generateLastfmTrackObject();
        delete toArtText.artist.name;
        expect(toArtText.artist['#text']).to.not.be.undefined;
        expect(formatPlayObj(toArtText).data.artists[0].name).to.eq(toArtText.artist['#text']);

        const toArtTextEmptyNAme = generateLastfmTrackObject();
        toArtTextEmptyNAme.artist.name = '';
        expect(toArtTextEmptyNAme.artist['#text']).to.not.be.undefined;
        expect(formatPlayObj(toArtTextEmptyNAme).data.artists[0].name).to.eq(toArtTextEmptyNAme.artist['#text']);

        const toArtName = generateLastfmTrackObject();
        delete toArtName.artist['#text'];
        expect(toArtName.artist.name).to.not.be.undefined;
        expect(formatPlayObj(toArtName).data.artists[0].name).to.eq(toArtName.artist.name);
    });

});

describe('#LFM Error Response Handling', function () {

    it('should catch error and include unexpected json message', async function () {
        await withRequestInterception([
            http.all('https://lfmtest.local/2.0', async () => {
                return HttpResponse.html('<html>You have made too many retries</html>', { status: 429 });
            })
        ], async function () {

            const lfm = new LastfmApiClient('mylfm-client-test', {
                apiKey: '',
                secret: '',
                session: '',
                urlBase: 'https://lfmtest.local/2.0'
            }, {
                logger: loggerTest,
                localUrl: new URL('http://localhost:9078'),
                configDir: '.',
                version: 'test'
            });

            await lfm.initialize({ name: 'test', sessionKey: 'test' });

            try {
                await lfm.testAuth();
            } catch (e) {
                const cause = findCauseByReference(e, LastFMResponseError);
                expect(cause).is.not.undefined;
                expect(cause.message).includes('Expected JSON response');
            }
        })();
    });

    it('should catch non-retryable error', async function () {
        await withRequestInterception([
            http.all('https://lfmtest.local/2.0', async () => {
                return HttpResponse.json({ error: { '#text': 'unspecified resource', code: 7 } }, { status: 200 });
            })
        ], async function () {

            const lfm = new LastfmApiClient('mylfm-client-test', {
                apiKey: '',
                secret: '',
                session: '',
                urlBase: 'https://lfmtest.local/2.0'
            }, {
                logger: loggerTest,
                localUrl: new URL('http://localhost:9078'),
                configDir: '.',
                version: 'test'
            });

            await lfm.initialize({ name: 'test', sessionKey: 'test' });

            try {
                await lfm.testAuth();
            } catch (e) {
                const cause = findCauseByReference(e, SimpleError);
                expect(cause).is.not.undefined;
                expect(cause.message).includes('Request attempt 1 failed');
            }
        })();
    });
});

describe('#LFM Rate Limiting', function () {

    it('should limit calls based on rate', async function () {
        let callCount = 0;
        await withRequestInterception([
            http.all('https://lfmtest.local/2.0', async () => {
                callCount++;
                return HttpResponse.json({ user: {name: 'test'} }, { status: 200 });
            })
        ], async function () {

            const lfm = new LastfmApiClient('mylfm-client-test', {
                apiKey: '',
                secret: '',
                session: '',
                urlBase: 'https://lfmtest.local/2.0',
                rateLimit: {points: 1, duration: 0.01}
            }, {
                logger: loggerTest,
                localUrl: new URL('http://localhost:9078'),
                configDir: '.',
                version: 'test'
            });

            await lfm.initialize({ name: 'test', sessionKey: 'test' });

            //const sp = spy(lfm, 'callApi');
            for(let i = 0; i < 5; i++) {
                lfm.testAuth().then(() => null).catch((e) => {throw e;});
            }
            await sleep(31);
            expect(callCount).to.eq(3);
        })();
    });
});