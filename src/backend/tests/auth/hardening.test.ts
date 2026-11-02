import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import type { Logger } from '@foxxmd/logging';
import { toNodeHandler } from 'better-auth/node';
import { buildAuthApp, secureApp, signIn } from '../utils/authTestUtils.ts';
import { CLIENT_IP_HEADER, clientIpMiddleware } from '../../server/middleware.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { createAuth } from '../../common/auth/auth.ts';
import { resolveAuthSettings } from '../../common/auth/authSettings.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { setUserPassword } from '../../common/auth/ownerPassword.ts';
import type ScrobbleSources from '../../sources/ScrobbleSources.ts';

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

        it('metrics require the bearer token when METRICS_TOKEN is set', async function () {
            const app = await withEnv({METRICS_TOKEN: 'promSecret'}, () => buildAuthApp());
            const none = await request(app).get('/api/metrics');
            expect(none.status).eq(401);
            expect(none.headers['www-authenticate']).eq('Bearer');
            expect((await request(app).get('/api/metrics').set('Authorization', 'Bearer wrong')).status).eq(401);
            expect((await request(app).get('/api/metrics').set('Authorization', 'Bearer promSecret')).status).eq(200);
        });

        it('metrics are public without METRICS_TOKEN and gone with PROMETHEUS=false', async function () {
            expect((await request(await buildAuthApp()).get('/api/metrics')).status).eq(200);
            const disabled = await withEnv({PROMETHEUS: 'false'}, () => buildAuthApp());
            // falls through to the auth-required api router, so: not found when unsecured, login required when secured
            expect((await request(disabled).get('/api/metrics')).status).eq(404);
            await secureApp(disabled);
            expect((await request(disabled).get('/api/metrics')).status).eq(401);
        });
    });
});
