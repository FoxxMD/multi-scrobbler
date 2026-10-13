import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';
import request from 'supertest';
import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer } from '../../server/index.ts';
import { getRoot } from '../../ioc.ts';
import { NDJSON_MEDIA_TYPE, type TrackSearchResult } from '../../../core/Api.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };

const buildApp = async () => {
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const [app] = await initServer({ sources, clients }, { testMode: true });
    return app;
};

const track: TrackSearchResult = { id: '1', service: 'spotify', score: 50, track: { name: 'Track' } };
const error = { service: 'rocksky', error: { name: 'Error', message: 'rocksky is down' } };

describe('Metadata Search Endpoints', function () {

    // the routes are only responsible for how provider outcomes are sent, so providers are replaced
    const tm = getRoot().items.transformerManager;
    const original = { stream: tm.streamTrackResults, get: tm.getTrackResults };
    before(function () {
        tm.streamTrackResults = async function* () {
            yield { type: 'result', service: track.service, data: [track] };
            yield { type: 'error', ...error };
        };
        tm.getTrackResults = async () => ({ data: [track], errors: [error] });
    });
    after(function () {
        tm.streamTrackResults = original.stream;
        tm.getTrackResults = original.get;
    });

    it('returns plain JSON when streaming is not asked for', async function () {
        const app = await buildApp();
        for (const accept of [undefined, '*/*', 'application/json']) {
            const req = request(app).get('/api/metadata/search/tracks').query({ track: 'Track' });
            const response = await (accept === undefined ? req : req.set('Accept', accept));
            expect(response.status, accept).eq(200);
            expect(response.type, accept).eq('application/json');
            expect(response.body, accept).eql({ data: [track], errors: [error] });
        }
    });

    it('streams a line per provider and a final done line when NDJSON is asked for', async function () {
        const app = await buildApp();
        const requests = [
            request(app).get('/api/metadata/search/tracks').query({ track: 'Track' }),
            request(app).post('/api/metadata/search/tracks').send({ track: { name: 'Track' } }),
        ];
        for (const req of requests) {
            const response = await req.set('Accept', NDJSON_MEDIA_TYPE).buffer(true).parse((res, cb) => {
                let text = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { text += chunk; });
                res.on('end', () => cb(null, text));
            });
            expect(response.status).eq(200);
            expect(response.type).eq(NDJSON_MEDIA_TYPE);
            expect(response.headers['x-accel-buffering']).eq('no');
            const lines = (response.body as string).trimEnd().split('\n').map((x) => JSON.parse(x));
            expect(lines).eql([
                { type: 'result', service: track.service, data: [track] },
                { type: 'error', ...error },
                { type: 'done' },
            ]);
        }
    });
});
