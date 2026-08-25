import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import request from 'supertest';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { loggerTest } from '@foxxmd/logging';
import type { ListenbrainzEndpointSourceConfig } from '../../common/infrastructure/config/source/endpointlz.ts';
import { initServer } from '../../server/index.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { zocker } from "zocker";
import { webScrobblePayloadSchema } from '../../common/vendor/webscrobbler/interfaces.ts';
import type { WebScrobblerSourceConfig } from '../../common/infrastructure/config/source/webscrobbler.ts';
import { sleep } from '../../utils.ts';
import { playToSubmitPayload } from '../../common/vendor/listenbrainz/lzUtils.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import dayjs from 'dayjs';
import { faker } from '@faker-js/faker';
import * as z from 'zod';
import pEvent from 'p-event';

chai.use(asPromised);

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };

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

            const [_, __] = await Promise.all([
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