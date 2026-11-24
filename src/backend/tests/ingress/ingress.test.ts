import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import request from 'supertest';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { loggerDebug, loggerTest } from '@foxxmd/logging';
import type { ListenbrainzEndpointSourceConfig } from '../../common/infrastructure/config/source/endpointlz.ts';
import { initServer } from '../../server/index.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { zocker } from "zocker";
import { webScrobblePayloadSchema } from '../../common/vendor/webscrobbler/interfaces.ts';
import type { WebScrobblerSourceConfig } from '../../common/infrastructure/config/source/webscrobbler.ts';
import { playToSubmitPayload } from '../../common/vendor/listenbrainz/lzUtils.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import dayjs from 'dayjs';
import { faker } from '@faker-js/faker';
import * as z from 'zod';
import pEvent from 'p-event';
import type { LastFMEndpointSourceConfig } from '../../common/infrastructure/config/source/endpointlfm.ts';
import { lastfmNowPlayingPayloadSchema, lastfmScrobblePayloadSchema } from '../../common/vendor/LastfmApiClient.ts';
import { removeUndefinedKeys } from '../../../core/DataUtils.ts';

chai.use(asPromised);

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' };

const defaultLzConfig: ListenbrainzEndpointSourceConfig & {source: string} = {
    id: 'test',
    enable: true,
    data: {},
    source: 'file'
};
const defaultWebscrobblerConfig: WebScrobblerSourceConfig & {source: string} = {
    id: 'test',
    enable: true,
    data: {},
    source: 'file'
};
const defaultLfmConfig: LastFMEndpointSourceConfig & {source: string} = {
    id: 'test',
    enable: true,
    data: {},
    source: 'file'
};


const generateSources = () => new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
describe('Listenbrainz Endpoint', function() {

    let clients: ScrobbleClients;
    before(function() {
        clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    });

    describe('Accepts requests on standard endpoints', function() {

        it('accepts requests to /1/validate-token with a config without token', async function() {
            const sources = generateSources();
            await sources.addSource('endpointlz', [defaultLzConfig]);
            const [app] = await initServer({sources, clients}, {testMode: true});
            const response = await request(app).get('/1/validate-token')
            
            expect(response.status).eq(200);
            expect(response.body.user_name).eq(defaultLzConfig.id);
        });

        it('accepts requests to /1/validate-token with a config with token', async function() {
            const sources = generateSources();
            await sources.addSource('endpointlz', [defaultLzConfig]);
            await sources.addSource('endpointlz', [{...defaultLzConfig, data: {token: 'foo'}, id: 'tokenTest'}]);
            const [app] = await initServer({sources, clients}, {testMode: true});
            const response = await request(app)
            .get('/1/validate-token')
            .set('Authorization', 'Token foo');
            
            expect(response.status).eq(200);
            expect(response.body.user_name).eq('tokenTest');
        });

        it('accepts requests to /1/submit-listens', async function() {
            const sources = generateSources();
            await sources.addSource('endpointlz', [defaultLzConfig]);
            const [app] = await initServer({sources, clients}, {testMode: true});
            const source = sources.sources[0];
            source.queueIdleMs = 2;
            await source.initialize();

            const [response, _] = await Promise.all([
                request(app).post('/1/submit-listens')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(playToSubmitPayload(generatePlay()))),
                pEvent(source.emitter, 'playInsert', {timeout: 1000})
            ]);
            
            expect(response.status).eq(200);
            expect( source.getApiData().queued).eq(1);
        });

        it('accepts requests to /1/playing-now', async function() {
            const sources = generateSources();
            await sources.addSource('endpointlz', [defaultLzConfig]);
            const [app] = await initServer({sources, clients}, {testMode: true});
            const source = sources.sources[0];
            source.queueIdleMs = 2;
            await source.initialize();

            await Promise.all([
                request(app).post('/1/submit-listens')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify({...playToSubmitPayload(generatePlay()), listen_type: 'playing_now'})),
                //pEvent(source.emitter, 'playInsert', {timeout: 1000})
            ]);

            const response = await request(app).get('/1/user/test/playing-now');
            expect(response.body.payload.listens).to.exist;
        });

    });

    describe('Accepts requests on slug endpoints', function() {

        it('accepts requests for submit-listens payload on /api/listenbrainz with no slug', async function() {
            const sources = generateSources();
            await sources.addSource('endpointlz', [defaultLzConfig]);
            const [app] = await initServer({sources, clients}, {testMode: true});
            const source = sources.sources[0];
            source.queueIdleMs = 2;
            await source.initialize();

            const [response, _] = await Promise.all([
                request(app).post('/api/listenbrainz')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(playToSubmitPayload(generatePlay()))),
                pEvent(source.emitter, 'playInsert', {timeout: 1000})
            ]);
            
            expect(response.status).eq(200);
            expect( source.getApiData().queued).eq(1);
        });

        it('accepts requests for submit-listens payload on /api/listenbrainz with slug', async function() {
            const sources = generateSources();
            await sources.addSource('endpointlz', [defaultLzConfig]);
            await sources.addSource('endpointlz', [{...defaultLzConfig, id: 'foo', data: {slug: 'foobar'}}]);
            const [app] = await initServer({sources, clients}, {testMode: true});
            const source = sources.sources[1];
            source.queueIdleMs = 2;
            await source.initialize();

            const [response, _] = await Promise.all([
                request(app).post('/api/listenbrainz/foobar')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(playToSubmitPayload(generatePlay()))),
                pEvent(source.emitter, 'playInsert', {timeout: 1000})
            ])
            
            expect(response.status).eq(200);
            expect( source.getApiData().queued).eq(1);
        });

    });

});

describe('Webscrobbler Endpoint', function() {

    let clients: ScrobbleClients;
    before(function() {
        clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    });

    it('accepts request to /api/webscrobbler', async function () {
        const sources = generateSources();
        await sources.addSource('webscrobbler', [defaultWebscrobblerConfig]);
        const source = sources.sources[0];
        source.queueIdleMs = 2;
        await source.initialize();
        const [app] = await initServer({ sources, clients }, { testMode: true });

        const payload = zocker(webScrobblePayloadSchema)
            .override(z.ZodString,() => faker.word.words({ count: { min: 1, max: 5 } }))
            .supply(webScrobblePayloadSchema.shape.data.shape.currentlyPlaying, true)
            .supply(webScrobblePayloadSchema.shape.time, dayjs().unix())
            .supply(webScrobblePayloadSchema.shape.data.shape.song.shape.processed.shape.duration, faker.number.int({ min: 30, max: 400 }))
            .supply(webScrobblePayloadSchema.shape.data.shape.song.shape.parsed.shape.duration, faker.number.int({ min: 30, max: 400 }))
            .supply(webScrobblePayloadSchema.shape.data.shape.song.shape.parsed.shape.isScrobblingAllowed, true)
            .supply(webScrobblePayloadSchema.shape.eventName, 'scrobble').generate()

        try {
            const [response, _] = await Promise.all([
                request(app).post('/api/webscrobbler')
                    .set('Content-Type', 'application/json')
                    .send(JSON.stringify(payload)),
                pEvent(source.emitter, 'playInsert', { timeout: 1000 })
            ]);
            expect(response.status).eq(200);
            expect(source.getApiData().queued, JSON.stringify(payload)).eq(1);
        } catch (e) {
            console.log(JSON.stringify(payload));
            throw e;
        }
    });
});

describe('Last.fm Endpoint', function () {

    let clients: ScrobbleClients;
    before(function () {
        clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    });

    describe('Accepts requests on slug endpoints', function () {
        it('accepts request to /api/lastfm with no slug', async function () {
            const sources = generateSources();
            await sources.addSource('endpointlfm', [defaultLfmConfig]);
            const source = sources.sources[0];
            source.queueIdleMs = 2;
            await source.initialize();
            const [app] = await initServer({ sources, clients }, { testMode: true, logger: loggerDebug });

            const payload = removeUndefinedKeys(zocker(lastfmScrobblePayloadSchema)
                .override(z.ZodString, () => faker.word.words({ count: { min: 1, max: 5 } }))
                .supply(lastfmScrobblePayloadSchema.shape.duration, faker.number.int({ min: 30, max: 400 }))
                .supply(lastfmScrobblePayloadSchema.shape.timestamp, dayjs(faker.date.recent()).unix())
                .generate());

            try {
                const [response] = await Promise.all([
                    request(app).post('/api/lastfm')
                        // @ts-expect-error its fine
                        .send(new URLSearchParams(payload).toString()),
                ]);
                expect(response.status).eq(200);
                expect(source.getApiData().queued, JSON.stringify(payload)).eq(1);
            } catch (e) {
                console.log(JSON.stringify(payload));
                throw e;
            }
        });
    });

    it('accepts request to /2.0 for auth.getMobileSession', async function () {
        const sources = generateSources();
        await sources.addSource('endpointlfm', [defaultLfmConfig]);
        const source = sources.sources[0];
        source.queueIdleMs = 2;
        await source.initialize();
        const [app] = await initServer({ sources, clients }, { testMode: true });

            const response = await request(app).post('/2.0')
                .set('Accept', 'application/json')
                .send(new URLSearchParams({username: 'atest', password: 'anything', api_key: '1234', api_sig: '5678', method: 'auth.getMobileSession'}).toString());
            expect(response.status).eq(200);
            expect(response.body.session.key).exist;
    });

    it('accepts request to /2.0 for track.scrobble', async function () {
        const sources = generateSources();
        await sources.addSource('endpointlfm', [defaultLfmConfig]);
        const source = sources.sources[0];
        source.queueIdleMs = 2;
        await source.initialize();
        const [app] = await initServer({ sources, clients }, { testMode: true });

        const payload = removeUndefinedKeys(zocker(lastfmScrobblePayloadSchema)
            .override(z.ZodString, () => faker.word.words({ count: { min: 1, max: 5 } }))
            .supply(lastfmScrobblePayloadSchema.shape.duration, faker.number.int({ min: 30, max: 400 }))
            .supply(lastfmScrobblePayloadSchema.shape.timestamp, dayjs(faker.date.recent()).unix())
            .generate());

        try {
            const [response] = await Promise.all([
                request(app).post('/api/lastfm')
                    // @ts-expect-error its fine
                    .send(new URLSearchParams(payload).toString()),
            ]);
            expect(response.status).eq(200);
            expect(source.getApiData().queued, JSON.stringify(payload)).eq(1);
        } catch (e) {
            console.log(JSON.stringify(payload));
            throw e;
        }
    });

    it('accepts request to /2.0 for track.updateNowPlaying', async function () {
        const sources = generateSources();
        await sources.addSource('endpointlfm', [defaultLfmConfig]);
        const source = sources.sources[0];
        source.queueIdleMs = 2;
        await source.initialize();
        const [app] = await initServer({ sources, clients }, { testMode: true });

        const payload = removeUndefinedKeys(zocker(lastfmNowPlayingPayloadSchema)
            .override(z.ZodString, () => faker.word.words({ count: { min: 1, max: 5 } }))
            .supply(lastfmScrobblePayloadSchema.shape.duration, faker.number.int({ min: 30, max: 400 }))
            .supply(lastfmScrobblePayloadSchema.shape.timestamp, dayjs(faker.date.recent()).unix())
            .generate());

        try {
            const [response] = await Promise.all([
                request(app).post('/api/lastfm')
                    // @ts-expect-error its fine
                    .send(new URLSearchParams(payload).toString()),
            ]);
            // TODO more accurate verification this is updating now playing
            expect(response.status).eq(200);
        } catch (e) {
            console.log(JSON.stringify(payload));
            throw e;
        }
    });
});
describe('Ingress gate', function () {

    let clients: ScrobbleClients;
    before(function () {
        clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    });

    // larger than the default body-parser limit, so a 413 would mean the body was read
    const tooLarge = JSON.stringify({payload: 'a'.repeat(200 * 1024)});

    it('rejects /1/submit-listens before reading the body when no LZ Endpoint Source is configured', async function () {
        const [app] = await initServer({sources: generateSources(), clients}, {testMode: true});
        const response = await request(app).post('/1/submit-listens').set('Content-Type', 'application/json').send(tooLarge);
        expect(response.status).eq(409);
    });

    it('rejects /1/submit-listens before reading the body when the token does not match', async function () {
        const sources = generateSources();
        await sources.addSource('endpointlz', [{...defaultLzConfig, data: {token: 'foo'}}]);
        const [app] = await initServer({sources, clients}, {testMode: true});
        const response = await request(app).post('/1/submit-listens')
            .set('Authorization', 'Token bar')
            .set('Content-Type', 'application/json')
            .send(tooLarge);
        expect(response.status).eq(409);
    });

    it('responds 413 with the body size when a matched request body is too large', async function () {
        const sources = generateSources();
        await sources.addSource('endpointlz', [defaultLzConfig]);
        const [app] = await initServer({sources, clients}, {testMode: true});
        const response = await request(app).post('/1/submit-listens').set('Content-Type', 'application/json').send(tooLarge);
        expect(response.status).eq(413);
        expect(response.body.error).to.include('Request body is 200');
    });

    it('reads a body larger than the default limit when the matched LZ Source sets maxBodySize', async function () {
        const sources = generateSources();
        const config: ListenbrainzEndpointSourceConfig & {source: string} = {...defaultLzConfig, options: {extractArtists: true, maxBodySize: '1mb'}};
        await sources.addSource('endpointlz', [config]);
        const [app] = await initServer({sources, clients}, {testMode: true});
        const response = await request(app).post('/1/submit-listens').set('Content-Type', 'application/json').send(tooLarge);
        // body was read, then failed schema validation
        expect(response.status).not.eq(413);
        expect(response.status).not.eq(409);
    });

    it('reads a body larger than the default limit when the matched LFM Source sets maxBodySize', async function () {
        const sources = generateSources();
        const config: LastFMEndpointSourceConfig & {source: string} = {...defaultLfmConfig, options: {maxBodySize: '1MB'}};
        await sources.addSource('endpointlfm', [config]);
        const [app] = await initServer({sources, clients}, {testMode: true});
        const response = await request(app).post('/2.0/').type('form').send(`method=foo&payload=${'a'.repeat(200 * 1024)}`);
        expect(response.status).not.eq(413);
        expect(response.status).not.eq(409);
    });

    it('rejects /2.0/ when no Lastfm Endpoint Source is configured', async function () {
        const [app] = await initServer({sources: generateSources(), clients}, {testMode: true});
        const response = await request(app).post('/2.0/').send('method=track.scrobble');
        expect(response.status).eq(409);
    });

    it('rejects /api/webscrobbler with a slug no Source has, with cors headers', async function () {
        const sources = generateSources();
        await sources.addSource('webscrobbler', [defaultWebscrobblerConfig]);
        const [app] = await initServer({sources, clients}, {testMode: true});
        const response = await request(app).post('/api/webscrobbler/nope').set('Origin', 'https://example.com').set('Content-Type', 'application/json').send(tooLarge);
        expect(response.status).eq(409);
        expect(response.header['access-control-allow-origin']).eq('*');
    });

    it('returns 404 for unknown /1/ routes when no LZ Endpoint Source is configured', async function () {
        const [app] = await initServer({sources: generateSources(), clients}, {testMode: true});
        const response = await request(app).post('/1/foo');
        expect(response.status).eq(404);
    });
});
