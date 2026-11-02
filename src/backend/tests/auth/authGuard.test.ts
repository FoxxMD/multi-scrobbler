import { expect } from 'chai';
import request from 'supertest';
import pEvent from 'p-event';
import { generateOpenApiSpec } from '@minisylar/express-typed-router';
import { buildAuthApp, buildAuthAppRouter, secureApp, signIn } from '../utils/authTestUtils.ts';
import { getRoutePolicy } from '../../server/authGuard.ts';
import type { ListenbrainzEndpointSourceConfig } from '../../common/infrastructure/config/source/endpointlz.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { playToSubmitPayload } from '../../common/vendor/listenbrainz/lzUtils.ts';

const lzConfig: ListenbrainzEndpointSourceConfig & {source: string} = {id: 'test', enable: true, data: {}, source: 'file'};

// a mutating, non-public route that is cheap to call
const MUTATE = '/api/components/999/plays/queue';

describe('Route Policy', function () {

    it('classifies routes', function () {
        expect(getRoutePolicy('/')).eq('public');
        expect(getRoutePolicy('/components/3')).eq('public');
        expect(getRoutePolicy('/1/submit-listens')).eq('public');
        expect(getRoutePolicy('/2.0/')).eq('public');
        expect(getRoutePolicy('/api/listenbrainz/mySlug')).eq('public');
        expect(getRoutePolicy('/api/lastfm')).eq('public');
        expect(getRoutePolicy('/api/webscrobbler')).eq('public');
        expect(getRoutePolicy('/api/spotify/callback')).eq('public');
        expect(getRoutePolicy('/api/deezer/callback')).eq('public');
        expect(getRoutePolicy('/api/health')).eq('public');
        expect(getRoutePolicy('/api/metrics')).eq('public');
        expect(getRoutePolicy('/api/version')).eq('public');
        expect(getRoutePolicy('/api/auth/sign-in/username')).eq('public');

        expect(getRoutePolicy('/api/components')).eq('user');
        expect(getRoutePolicy('/api/events')).eq('user');
        expect(getRoutePolicy('/api/logs')).eq('user');
        expect(getRoutePolicy('/api/docs')).eq('user');

        expect(getRoutePolicy('/api/components/1/state')).eq('user');
        expect(getRoutePolicy('/api/logs')).eq('user');
        expect(getRoutePolicy('/api/cache/metadata')).eq('user');
        // not fooled by a public prefix lookalike
        expect(getRoutePolicy('/api/healthcheck')).eq('user');
    });
});

describe('Auth Guard', function () {

    it('unsecured instance behaves like before auth existed', async function () {
        const app = await buildAuthApp();
        const res = await request(app).post(MUTATE).send({});
        expect(res.status).not.eq(401);
    });

    it('disabled mode never requires auth', async function () {
        const app = await buildAuthApp({authSettings: {mode: 'disabled'}});
        await secureApp(app);
        expect((await request(app).post(MUTATE).send({})).status).not.eq(401);
    });

    it('secured instance requires a session for mutations', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const res = await request(app).post(MUTATE).send({});
        expect(res.status).eq(401);
        expect(res.body.code).eq('auth_required');

        const cookie = await signIn(app);
        expect((await request(app).post(MUTATE).set('Cookie', cookie).send({})).status).not.eq(401);
    });

    it('secured instance requires a session for reads', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const res = await request(app).get('/api/components');
        expect(res.status).eq(401);
        expect(res.body.code).eq('auth_required');
        // SSE stream is rejected before it opens
        expect((await request(app).get('/api/events')).status).eq(401);

        const cookie = await signIn(app);
        expect((await request(app).get('/api/components').set('Cookie', cookie)).status).eq(200);
    });

    it('unsecured instance keeps reads open', async function () {
        const app = await buildAuthApp();
        expect((await request(app).get('/api/components')).status).eq(200);
    });

    it('cookie-authenticated mutation from another origin is blocked', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const cookie = await signIn(app);
        const res = await request(app).post(MUTATE).set('Cookie', cookie).set('Origin', 'http://evil.example.com').send({});
        expect(res.status).eq(403);
    });

    it('invalid session cookie is anonymous', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        expect((await request(app).post(MUTATE).set('Cookie', 'ms.session_token=garbage').send({})).status).eq(401);
    });

    it('ingress, callbacks and health keep working on a secured instance without a session', async function () {
        const app = await buildAuthApp({}, async (sources) => {
            await sources.addSource('endpointlz', [lzConfig]);
        });
        await secureApp(app);

        expect((await request(app).get('/api/health')).status).not.eq(401);
        expect((await request(app).get('/api/version')).status).eq(200);
        expect((await request(app).get('/api/metrics')).status).eq(200);
        expect((await request(app).get('/1/validate-token')).status).eq(200);
        expect((await request(app).post('/api/webscrobbler').send({})).status).not.eq(401);
        expect((await request(app).post('/api/lastfm').send({})).status).not.eq(401);
        expect((await request(app).post('/2.0/').send({})).status).not.eq(401);
        expect((await request(app).get('/api/spotify/callback')).status).not.eq(401);
    });

    it('listenbrainz endpoint scrobbles on a secured instance', async function () {
        let source: any;
        const app = await buildAuthApp({}, async (sources) => {
            await sources.addSource('endpointlz', [lzConfig]);
            source = sources.sources[0];
        });
        await secureApp(app);
        source.queueIdleMs = 2;
        await source.initialize();
        const [response] = await Promise.all([
            request(app).post('/1/submit-listens')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify(playToSubmitPayload(generatePlay()))),
            pEvent(source.emitter, 'playInsert', {timeout: 1000})
        ]);
        expect(response.status).eq(200);
    });

    it('every documented route matches its expected policy on a secured instance', async function () {
        this.timeout(10000);
        const [app, router] = await buildAuthAppRouter();
        await secureApp(app);
        const spec = await generateOpenApiSpec(router, {title: 'test', version: '0'});
        let checked = 0;
        for (const [rawPath, item] of Object.entries(spec.paths)) {
            if (rawPath.includes('(') || rawPath.includes('*')) {
                continue;
            }
            const path = rawPath.replace(/\{[^}]+\}/g, '1');
            for (const method of Object.keys(item as object)) {
                const policy = getRoutePolicy(path);
                // regex routes (source auth callbacks) are not real paths in the spec, covered by Route Policy tests
                if (!path.startsWith("/")) {
                    continue;
                }
                const res = await (request(app) as any)[method](path).send({});
                if (policy === 'user') {
                    expect(res.status, `${method.toUpperCase()} ${rawPath} should require auth`).eq(401);
                } else {
                    expect(res.status, `${method.toUpperCase()} ${rawPath} should not require auth (${policy})`).not.eq(401);
                }
                checked++;
            }
        }
        expect(checked).gt(20);
    });
});
