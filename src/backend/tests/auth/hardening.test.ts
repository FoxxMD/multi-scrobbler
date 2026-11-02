import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import { buildAuthApp } from '../utils/authTestUtils.ts';
import { CLIENT_IP_HEADER, clientIpMiddleware } from '../../server/middleware.ts';

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
});
