import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import type { Logger } from '@foxxmd/logging';
import { toNodeHandler } from 'better-auth/node';
import { buildAuthApp, createApiKey, secureApp, signIn } from '../utils/authTestUtils.ts';
import { CLIENT_IP_HEADER, clientIpMiddleware, isPrivateAddress, isPublicClient, isRecognizedHost } from '../../server/middleware.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { createAuth } from '../../common/auth/auth.ts';
import { resolveAuthSettings } from '../../common/auth/authSettings.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { setUserPassword } from '../../common/auth/ownerPassword.ts';
import type ScrobbleSources from '../../sources/ScrobbleSources.ts';
import { PassThrough } from 'node:stream';
import type { ServerLocals } from '../../server/index.ts';
import { optionalAuth } from '../../server/requireAuth.ts';
import { HIDDEN_FROM_WEB, hideSecrets } from '../../server/api.ts';

/** run with env vars set, restoring them afterwards */
const withEnv = async <T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> => {
    const prev = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
    Object.assign(process.env, env);
    try {
        return await fn();
    } finally {
        for (const [k, v] of Object.entries(prev)) {
            if (v === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = v;
            }
        }
    }
};

const unhealthy = async (sources: ScrobbleSources) => {
    sources.getStatusSummary = async () => [false, ['Source subsonic - mySecretServer is not polling.']];
};

const ipEcho = (trustProxy: boolean) => {
    const app = express();
    app.use(clientIpMiddleware({trustProxy}));
    app.get('/', (req, res) => res.json({ip: req.headers[CLIENT_IP_HEADER] ?? null}));
    return app;
};

describe('Hardening', function () {

    describe('Client IP for rate limiting', function () {

        it('uses the connection address and ignores forged headers without TRUST_PROXY', async function () {
            const res = await request(ipEcho(false)).get('/')
                .set('X-Forwarded-For', '1.2.3.4')
                .set(CLIENT_IP_HEADER, '5.6.7.8');
            expect(res.body.ip).eq('127.0.0.1');
        });

        it('uses the right-most X-Forwarded-For entry with TRUST_PROXY', async function () {
            // client forged 1.2.3.4, proxy appended the real client 9.9.9.9
            const res = await request(ipEcho(true)).get('/')
                .set('X-Forwarded-For', '1.2.3.4, 9.9.9.9')
                .set(CLIENT_IP_HEADER, '5.6.7.8');
            expect(res.body.ip).eq('9.9.9.9');
        });

        it('falls back to the connection address with TRUST_PROXY but no proxy header', async function () {
            expect((await request(ipEcho(true)).get('/')).body.ip).eq('127.0.0.1');
        });
    });

    describe('Security headers', function () {

        it('are set on api, auth and dashboard responses', async function () {
            const app = await buildAuthApp();
            for (const path of ['/api/version', '/api/components', '/api/auth/setup/status', '/components/3']) {
                const res = await request(app).get(path);
                expect(res.headers['x-frame-options'], path).eq('DENY');
                // express's own 404 page (no SPA in test mode) replaces the CSP with an even stricter one
                if (path.startsWith('/api')) {
                    expect(res.headers['content-security-policy'], path).eq("frame-ancestors 'none'");
                }
                expect(res.headers['x-content-type-options'], path).eq('nosniff');
                expect(res.headers['referrer-policy'], path).eq('same-origin');
            }
        });
    });

    describe('Unused better-auth endpoints', function () {

        it('admin plugin endpoints do not exist', async function () {
            const app = await buildAuthApp();
            await secureApp(app);
            const cookie = await signIn(app);
            const res = await request(app).get('/api/auth/admin/list-users')
                .set('Host', 'localhost:9078')
                .set('Origin', 'http://localhost:9078')
                .set('Cookie', cookie);
            expect(res.status).eq(404);
        });
    });

    describe('Login audit log', function () {

        it('logs failed and successful logins with the client IP', async function () {
            const logs: [string, string][] = [];
            const capture = (level: string) => (msg: string) => { logs.push([level, msg]); };
            const logger = {info: capture('info'), warn: capture('warn'), error: capture('error'), debug: capture('debug'), verbose: capture('verbose')} as unknown as Logger;

            const db = await transientDb();
            const settings = resolveAuthSettings({localUrl: new URL('http://localhost:9078'), hasDefinedBaseUrl: false, env: {}});
            const auth = createAuth(db, settings, {basePath: '/', logger});
            const owner = await ensureOwner(db);
            await setUserPassword(auth, owner.id, 'ownerPassword');
            const app = express();
            app.all('/api/auth/*splat', clientIpMiddleware(), toNodeHandler(auth));

            await request(app).post('/api/auth/sign-in/username').set('X-Forwarded-For', '6.6.6.6').send({username: 'admin\nLogin succeeded for user "admin" from 1.1.1.1', password: 'wrong'});
            await request(app).post('/api/auth/sign-in/username').send({username: 'admin', password: 'ownerPassword'});

            const failed = logs.find(([, m]) => m.startsWith('Login failed'));
            expect(failed?.[0]).eq('warn');
            // client IP from the connection, not the forged header, and the username can't inject a second log line
            expect(failed?.[1]).match(/^Login failed for user "admin\\nLogin succeeded.*" from 127\.0\.0\.1: /);
            expect(failed?.[1]).not.include('\n');
            expect(logs).to.deep.include(['info', 'Login succeeded for user "admin" from 127.0.0.1']);
        });
    });

    describe('Public endpoints reveal less', function () {

        it('health only reports status to anonymous requests on a secured instance', async function () {
            const app = await buildAuthApp({}, unhealthy);
            // unsecured instance: details as before
            expect((await request(app).get('/api/health')).body.messages).eql(['Source subsonic - mySecretServer is not polling.']);

            await secureApp(app);
            const anon = await request(app).get('/api/health?name=mySecretServer');
            expect(anon.status).eq(500);
            expect(anon.body.messages).eql([]);

            const cookie = await signIn(app);
            const authed = await request(app).get('/api/health').set('Cookie', cookie);
            expect(authed.status).eq(500);
            expect(authed.body.messages).eql(['Source subsonic - mySecretServer is not polling.']);
        });

        it('setup status omits the username once secured, unless logged in', async function () {
            const app = await buildAuthApp();
            expect((await request(app).get('/api/auth/setup/status')).body.username).eq('admin');
            await secureApp(app);
            expect((await request(app).get('/api/auth/setup/status')).body).not.have.property('username');
            const cookie = await signIn(app);
            expect((await request(app).get('/api/auth/setup/status').set('Cookie', cookie)).body.username).eq('admin');
        });

        it('metrics require auth once secured', async function () {
            const app = await buildAuthApp();
            expect((await request(app).get('/api/metrics')).status).eq(200);
            await secureApp(app);
            expect((await request(app).get('/api/metrics')).status).eq(401);
            const key = await createApiKey(app, await signIn(app), 'read');
            expect((await request(app).get('/api/metrics').set('Authorization', `Bearer ${key}`)).status).eq(200);
        });

        it('metrics are gone with PROMETHEUS=false', async function () {
            const disabled = await withEnv({PROMETHEUS: 'false'}, () => buildAuthApp());
            // falls through to the auth-required api router, so: not found when unsecured, login required when secured
            expect((await request(disabled).get('/api/metrics')).status).eq(404);
            await secureApp(disabled);
            expect((await request(disabled).get('/api/metrics')).status).eq(401);
        });
    });

    describe('Setup token in dashboard logs', function () {

        const TOKEN = 'superSecretSetupToken123';

        it('is hidden from the log lines sent to the browser', async function () {
            const stream = new PassThrough({objectMode: true});
            const app = await buildAuthApp({appLoggerStream: stream, authSettings: {setupToken: TOKEN, setupTokenGenerated: true}});
            stream.write({level: 40, time: Date.now(), msg: `Setup token: ${TOKEN}`, line: `WARN : [Auth] Setup token: ${TOKEN}`});
            stream.write({level: 40, time: Date.now(), msg: 'Admin password setup failed from 1.2.3.4: wrong token', line: 'WARN : [Auth] Admin password setup failed from 1.2.3.4: wrong token'});
            await new Promise(resolve => setImmediate(resolve));

            // test logger is silent, show everything
            const res = await request(app).put('/api/logs').send({level: 'debug'});
            const body = JSON.stringify(res.body);
            expect(body).not.include(TOKEN);
            expect(body).include(HIDDEN_FROM_WEB);
            // audit lines stay visible
            expect(body).include('Admin password setup failed from 1.2.3.4');
        });

        it('shows log lines from before the server started, without the token', async function () {
            const app = await buildAuthApp({
                authSettings: {setupToken: TOKEN, setupTokenGenerated: true},
                initialOutput: [
                    {level: 40, time: Date.now(), msg: 'Started before the server', line: 'WARN : Started before the server'},
                    {level: 40, time: Date.now(), msg: `Setup token: ${TOKEN}`, line: `WARN : Setup token: ${TOKEN}`},
                ] as any,
            });
            const body = JSON.stringify((await request(app).put('/api/logs').send({level: 'debug'})).body);
            expect(body).include('Started before the server');
            expect(body).not.include(TOKEN);
        });

        it('leaves lines without secrets untouched', function () {
            const log = {level: 30, time: 1, msg: 'hello', line: 'hello'} as any;
            expect(hideSecrets(log, [TOKEN])).eq(log);
            expect(hideSecrets(log, [])).eq(log);
        });
    });

    describe('Public client detection', function () {

        const req = (socket: string | undefined, forwarded?: string) => ({
            socket: {remoteAddress: socket},
            get: (name: string) => name.toLowerCase() === 'x-forwarded-for' ? forwarded : undefined,
        }) as any;

        it('knows private addresses', function () {
            for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.101', '100.64.0.1', '100.127.255.255', '169.254.1.1', '::1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.0.5', '::FFFF:10.0.0.1']) {
                expect(isPrivateAddress(ip), ip).is.true;
            }
            for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '203.0.113.7', '2001:4860::8888', '::ffff:8.8.8.8', 'not-an-ip', '']) {
                expect(isPrivateAddress(ip), ip).is.false;
            }
        });

        it('detects public clients without TRUST_PROXY', function () {
            expect(isPublicClient(req('192.168.0.5'))).is.false;
            expect(isPublicClient(req('8.8.8.8'))).is.true;
            // public connection can't hide behind a forged header
            expect(isPublicClient(req('8.8.8.8', '192.168.0.5'))).is.true;
            // reverse proxy on the LAN, right-most entry is what the proxy appended
            expect(isPublicClient(req('172.17.0.1', '192.168.0.5, 8.8.8.8'))).is.true;
            expect(isPublicClient(req('172.17.0.1', '8.8.8.8, 192.168.0.5'))).is.false;
            expect(isPublicClient(req(undefined))).is.false;
        });

        it('uses the forwarded address with TRUST_PROXY', function () {
            expect(isPublicClient(req('172.17.0.1', '8.8.8.8'), {trustProxy: true})).is.true;
            expect(isPublicClient(req('172.17.0.1', '192.168.0.5'), {trustProxy: true})).is.false;
            expect(isPublicClient(req('172.17.0.1'), {trustProxy: true})).is.false;
        });

        it('warns at most hourly when an unsecured instance is used from a public IP', async function () {
            const app = await buildAuthApp();
            const {auth, authSettings, authState} = app.locals as ServerLocals;
            const logs: string[] = [];
            const logger = {warn: (m: string) => logs.push(m), info: () => undefined, debug: () => undefined, verbose: () => undefined, error: () => undefined} as unknown as Logger;
            const probe = express();
            probe.use(clientIpMiddleware(), optionalAuth({auth, settings: authSettings, state: authState, logger}));
            probe.get('/', (req, res) => res.json({}));

            await request(probe).get('/');
            expect(logs).length(0);
            await request(probe).get('/').set('X-Forwarded-For', '8.8.8.8');
            await request(probe).get('/').set('X-Forwarded-For', '8.8.8.8');
            expect(logs).length(1);
            expect(logs[0]).match(/^Unsecured instance was used from 127\.0\.0\.1 \(forwarded for 8\.8\.8\.8\), which looks like a public IP/);
        });
    });

    describe('DNS rebinding (unrecognized hosts while unsecured)', function () {

        const MUTATE = '/api/components/999/plays/queue';
        const open = {allowedHosts: ['*'], hostsOpen: true, fallbackOrigin: 'http://localhost:9078'};

        it('recognizes hosts that cannot be rebound', function () {
            for (const host of ['192.168.0.101:9078', '127.0.0.1', '[::1]:9078', '[fd00::5]', 'localhost:9078', 'nas', 'nas:9078', 'NAS.', 'mycoolsite.local', 'ms.lan:80', 'ms.home.arpa', 'ms.internal', 'box.tail1234.ts.net', 'app.localhost']) {
                expect(isRecognizedHost(host, open), host).is.true;
            }
            for (const host of ['ms.mydomain.com', 'evil.example.com:9078', 'mycoolsite.dev', 'local.evil.com', undefined, '', ':9078']) {
                expect(isRecognizedHost(host, open), String(host)).is.false;
            }
        });

        it('recognizes the BASE_URL host and ALLOWED_HOSTS', function () {
            expect(isRecognizedHost('ms.mydomain.com', {...open, fallbackOrigin: 'https://ms.mydomain.com'})).is.true;
            expect(isRecognizedHost('ms.mydomain.com:443', {...open, fallbackOrigin: 'https://ms.mydomain.com'})).is.true;
            const restricted = {...open, hostsOpen: false, allowedHosts: ['*.mydomain.com', 'other.example.com:9078']};
            expect(isRecognizedHost('ms.mydomain.com', restricted)).is.true;
            expect(isRecognizedHost('other.example.com:9078', restricted)).is.true;
            expect(isRecognizedHost('other.example.com:1234', restricted)).is.false;
            expect(isRecognizedHost('evil.com', restricted)).is.false;
            expect(isRecognizedHost('mydomain.com.evil.com', restricted)).is.false;
        });

        it('makes an unsecured instance read-only through unrecognized hosts', async function () {
            const app = await buildAuthApp();
            expect((await request(app).get('/api/components').set('Host', 'ms.mydomain.com')).status).eq(200);
            const res = await request(app).post(MUTATE).set('Host', 'ms.mydomain.com').send({});
            expect(res.status).eq(403);
            expect(res.body.code).eq('unsecured_read_only');
            expect(res.body.error).include('ms.mydomain.com');
            // recognized host is unaffected
            expect((await request(app).post(MUTATE).set('Host', '192.168.0.101:9078').send({})).status).not.oneOf([401, 403]);
        });

        it('uses X-Forwarded-Host with TRUST_PROXY', async function () {
            const app = await buildAuthApp({authSettings: {trustProxy: true}});
            expect((await request(app).post(MUTATE).set('Host', 'upstream:9078').set('X-Forwarded-Host', 'ms.mydomain.com').send({})).status).eq(403);
            expect((await request(app).post(MUTATE).set('Host', 'ms.mydomain.com').set('X-Forwarded-Host', 'ms.lan').send({})).status).not.oneOf([401, 403]);
        });

        it('requires the setup token through unrecognized hosts', async function () {
            const app = await buildAuthApp({authSettings: {setupToken: 'sekret'}});
            const status = (await request(app).get('/api/auth/setup/status').set('Host', 'ms.mydomain.com')).body;
            expect(status).include({setupTokenRequired: true, setupTokenReason: 'host', hostRecognized: false, host: 'ms.mydomain.com'});
            expect((await request(app).post('/api/auth/setup/password').set('Host', 'ms.mydomain.com').send({password: 'ownerPassword'})).status).eq(403);
            expect((await request(app).post('/api/auth/setup/password').set('Host', 'ms.mydomain.com').send({password: 'ownerPassword', token: 'sekret'})).status).eq(200);
        });

        it('does not apply to secured or disabled instances', async function () {
            const secured = await buildAuthApp();
            await secureApp(secured);
            const cookie = await signIn(secured);
            expect((await request(secured).post(MUTATE).set('Host', 'ms.mydomain.com').set('Cookie', cookie).send({})).status).not.oneOf([401, 403]);

            const disabled = await buildAuthApp({authSettings: {mode: 'disabled'}});
            expect((await request(disabled).post(MUTATE).set('Host', 'ms.mydomain.com').send({})).status).not.oneOf([401, 403]);
        });
    });
});
