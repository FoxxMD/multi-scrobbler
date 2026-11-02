import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import { buildAuthApp, secureApp, signIn } from '../utils/authTestUtils.ts';
import { CLIENT_IP_HEADER, clientIpMiddleware } from '../../server/middleware.ts';
import type ScrobbleSources from '../../sources/ScrobbleSources.ts';

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
    });
});
