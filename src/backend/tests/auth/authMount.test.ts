import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import { sameOriginMiddleware } from '../../server/middleware.ts';
import { buildAuthApp } from '../utils/authTestUtils.ts';

describe('Same Origin Middleware', function () {
    const app = express();
    app.use(sameOriginMiddleware());
    app.all('/x', (req, res) => res.sendStatus(200));

    it('allows safe methods from anywhere', async function () {
        expect((await request(app).get('/x').set('Origin', 'http://evil.example.com').set('Sec-Fetch-Site', 'cross-site')).status).eq(200);
    });
    it('allows requests without origin (non-browser)', async function () {
        expect((await request(app).post('/x')).status).eq(200);
    });
    it('allows same origin', async function () {
        expect((await request(app).post('/x').set('Host', '192.168.1.50:9078').set('Origin', 'http://192.168.1.50:9078').set('Sec-Fetch-Site', 'same-origin')).status).eq(200);
    });
    it('blocks cross-site and same-site fetch metadata', async function () {
        expect((await request(app).post('/x').set('Sec-Fetch-Site', 'cross-site')).status).eq(403);
        expect((await request(app).post('/x').set('Sec-Fetch-Site', 'same-site')).status).eq(403);
    });
    it('blocks mismatched origin and referer', async function () {
        expect((await request(app).post('/x').set('Host', '192.168.1.50:9078').set('Origin', 'http://192.168.1.50:8080')).status).eq(403);
        expect((await request(app).post('/x').set('Host', '192.168.1.50:9078').set('Referer', 'http://evil.example.com/page')).status).eq(403);
    });
    it('uses forwarded host only when proxy is trusted', async function () {
        const proxied = express();
        proxied.use(sameOriginMiddleware({trustProxy: true}));
        proxied.all('/x', (req, res) => res.sendStatus(200));
        expect((await request(proxied).post('/x').set('Host', '127.0.0.1:9078').set('X-Forwarded-Host', 'ms.example.com').set('Origin', 'https://ms.example.com')).status).eq(200);
        expect((await request(app).post('/x').set('Host', '127.0.0.1:9078').set('X-Forwarded-Host', 'ms.example.com').set('Origin', 'https://ms.example.com')).status).eq(403);
    });
});

describe('Auth Handler Mount', function () {

    it('serves better-auth under /api/auth', async function () {
        const res = await request(await buildAuthApp()).get('/api/auth/ok');
        expect(res.status).eq(200);
    });

    it('does not allow public sign up', async function () {
        const res = await request(await buildAuthApp())
            .post('/api/auth/sign-up/email')
            .send({email: 'a@b.invalid', password: 'password1234', name: 'a'});
        expect(res.status).to.be.oneOf([400, 403]);
    });

    it('blocks cross-site auth requests when hosts are open', async function () {
        const res = await request(await buildAuthApp())
            .post('/api/auth/sign-in/username')
            .set('Origin', 'http://evil.example.com')
            .set('Sec-Fetch-Site', 'cross-site')
            .send({username: 'admin', password: 'password1234'});
        expect(res.status).eq(403);
        expect(res.body.code).eq('cross_site');
    });
});
