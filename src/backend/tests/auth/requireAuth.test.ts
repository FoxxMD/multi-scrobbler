import { expect } from 'chai';
import request from 'supertest';
import pEvent from 'p-event';
import { generateOpenApiSpec } from '@minisylar/express-typed-router';
import { buildAuthApp, buildAuthAppRouter, secureApp, signIn } from '../utils/authTestUtils.ts';
import { SECURITY_REQUIRED, SECURITY_SCHEMES } from '../../server/requireAuth.ts';
import type { ListenbrainzEndpointSourceConfig } from '../../common/infrastructure/config/source/endpointlz.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { playToSubmitPayload } from '../../common/vendor/listenbrainz/lzUtils.ts';

const lzConfig: ListenbrainzEndpointSourceConfig & {source: string} = {id: 'test', enable: true, data: {}, source: 'file'};

// a mutating, non-public route that is cheap to call
const MUTATE = '/api/components/999/plays/queue';

describe('Require Auth', function () {

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

    it('ingress and health keep working on a secured instance without a session', async function () {
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

    it('third-party auth callbacks require a session on a secured instance', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        for (const path of ['/api/spotify/callback', '/api/lastfm/callback', '/api/deezer/callback', '/api/mixcloud/callback']) {
            expect((await request(app).get(path)).status, path).eq(401);
        }
        // a logged in browser following the redirect gets through
        const cookie = await signIn(app);
        expect((await request(app).get('/api/lastfm/callback').set('Cookie', cookie)).status).not.eq(401);
    });

    it('browser navigation gets a readable page, api calls get json', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const page = await request(app).get('/api/spotify/callback?code=abc')
            .set('Host', 'ms.example.com')
            .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
        expect(page.status).eq(401);
        expect(page.type).eq('text/html');
        expect(page.text).to.include('ms.example.com');
        expect(page.text).to.include('href="/login"');

        // host header is reflected, so it must be escaped
        const evil = await request(app).get('/api/spotify/callback').set('Host', '<script>x</script>').set('Accept', 'text/html');
        expect(evil.text).not.to.include('<script>x');

        const api = await request(app).get('/api/components').set('Accept', 'application/json');
        expect(api.type).eq('application/json');
        expect(api.body.code).eq('auth_required');
        // no Accept preference (ky, curl) is treated as an api call
        expect((await request(app).get('/api/components')).body.code).eq('auth_required');
    });

    it('non-api paths never require auth', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        // dashboard routes and static assets (served by vite-express outside test mode) must reach the SPA
        expect((await request(app).get('/components/3')).status).not.eq(401);
        expect((await request(app).get('/docs/')).status).not.eq(401);
        // unknown api routes do not reveal whether they exist
        expect((await request(app).get('/api/doesNotExist')).status).eq(401);
    });

    it('every documented route enforces the security it documents on a secured instance', async function () {
        this.timeout(10000);
        // the only routes that should be public. Anything else documented as public is a mistake.
        const EXPECTED_PUBLIC = [
            'POST /api/listenbrainz',
            'POST /1/submit-listens',
            'GET /1/user/{username}/playing-now',
            'GET /1/validate-token',
            'POST /api/lastfm',
            'POST /2.0/',
            'POST /api/webscrobbler',
            'GET /api/health',
            'GET /api/metrics',
            'GET /api/version',
        ];
        const [app, router] = await buildAuthAppRouter();
        await secureApp(app);
        const spec = await generateOpenApiSpec(router, {title: 'test', version: '0', securitySchemes: SECURITY_SCHEMES});
        const documentedPublic: string[] = [];
        let checked = 0;
        for (const [rawPath, item] of Object.entries(spec.paths)) {
            for (const [method, op] of Object.entries(item as Record<string, {security?: unknown[]}>)) {
                const name = `${method.toUpperCase()} ${rawPath}`;
                expect(op.security, `${name} should document its security`).is.not.undefined;
                const isPublic = op.security!.length === 0;
                if (isPublic) {
                    documentedPublic.push(name);
                } else {
                    expect(op.security, `${name} should accept a session or API key`).eql(SECURITY_REQUIRED);
                }
                // regex routes (source auth callbacks) and splat routes are not real paths in the spec
                if (!rawPath.startsWith('/') || rawPath.includes('*') || rawPath.includes('.{')) {
                    continue;
                }
                const path = rawPath.replace(/\{[^}]+\}/g, '1');
                const res = await (request(app) as any)[method](path).send({});
                if (isPublic) {
                    expect(res.status, `${name} should not require auth`).not.eq(401);
                } else {
                    expect(res.status, `${name} should require auth`).eq(401);
                }
                checked++;
            }
        }
        expect(documentedPublic.sort()).eql([...EXPECTED_PUBLIC].sort());
        expect(checked).gt(20);
    });
});
