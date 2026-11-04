import { expect } from 'chai';
import request from 'supertest';
import { buildAuthApp } from '../utils/authTestUtils.ts';
import type { ServerLocals } from '../../server/index.ts';

const MUTATE = '/api/components/999/plays/queue';

const cookieFrom = (res: request.Response) => res.headers['set-cookie'] as unknown as string[];

describe('Instance Setup', function () {

    describe('default mode (default)', function () {

        it('reports unsecured status', async function () {
            const app = await buildAuthApp();
            const res = await request(app).get('/api/auth/setup/status');
            expect(res.status).eq(200);
            expect(res.body).to.include({mode: 'default', secured: false, passwordSet: false, setupTokenRequired: false, isOwner: false, username: 'admin'});
        });

        it('anyone can set the first password, gets logged in, and the instance becomes secured', async function () {
            const app = await buildAuthApp();
            const res = await request(app).post('/api/auth/setup/password').send({password: 'ownerPassword'});
            expect(res.status).eq(200);
            const cookie = cookieFrom(res);
            expect(cookie.some(x => x.startsWith('ms.session_token='))).is.true;

            expect((app.locals as ServerLocals).authState.secured).is.true;
            expect((await request(app).post(MUTATE).send({})).status).eq(401);
            expect((await request(app).post(MUTATE).set('Cookie', cookie).send({})).status).not.eq(401);

            const status = await request(app).get('/api/auth/setup/status').set('Cookie', cookie);
            expect(status.body).to.include({secured: true, passwordSet: true, isOwner: true});

            // second attempt is rejected
            expect((await request(app).post('/api/auth/setup/password').send({password: 'attackerPassword'})).status).eq(409);
        });

        it('rejects a too short password', async function () {
            const app = await buildAuthApp();
            expect((await request(app).post('/api/auth/setup/password').send({password: 'short'})).status).eq(400);
            expect((app.locals as ServerLocals).authState.secured).is.false;
        });

        it('requires the setup token when configured', async function () {
            const app = await buildAuthApp({authSettings: {setupToken: 'sekret', setupTokenAlways: true}});
            expect((await request(app).get('/api/auth/setup/status')).body).include({setupTokenRequired: true, setupTokenReason: 'configured'});
            expect((await request(app).post('/api/auth/setup/password').send({password: 'ownerPassword'})).status).eq(403);
            expect((await request(app).post('/api/auth/setup/password').send({password: 'ownerPassword', token: 'wrong!'})).status).eq(403);
            expect((await request(app).post('/api/auth/setup/password').send({password: 'ownerPassword', token: 'sekret'})).status).eq(200);
        });

        it('requires the setup token for clients that look public', async function () {
            const app = await buildAuthApp({authSettings: {setupToken: 'sekret'}});
            // private connection (supertest is local) without a proxy header: no token
            expect((await request(app).get('/api/auth/setup/status')).body).include({setupTokenRequired: false, publicClient: false});

            // a reverse proxy on the LAN forwarding a public client
            const PUBLIC = '203.0.113.7';
            const status = (await request(app).get('/api/auth/setup/status').set('X-Forwarded-For', PUBLIC)).body;
            expect(status).include({setupTokenRequired: true, setupTokenReason: 'public_ip', publicClient: true});
            const noToken = await request(app).post('/api/auth/setup/password').set('X-Forwarded-For', PUBLIC).send({password: 'ownerPassword'});
            expect(noToken.status).eq(403);
            expect(noToken.body.code).eq('INVALID_SETUP_TOKEN');
            // client-supplied value of the signal header is ignored
            expect((await request(app).post('/api/auth/setup/password').set('X-Forwarded-For', PUBLIC).set('x-ms-client-public', '0').send({password: 'ownerPassword'})).status).eq(403);
            expect((await request(app).post('/api/auth/setup/password').set('X-Forwarded-For', PUBLIC).send({password: 'ownerPassword', token: 'sekret'})).status).eq(200);
        });

        it('setup endpoints are protected from cross-site requests', async function () {
            const app = await buildAuthApp();
            const res = await request(app).post('/api/auth/setup/password').set('Origin', 'http://evil.example.com').send({password: 'ownerPassword'});
            expect(res.status).eq(403);
            expect((app.locals as ServerLocals).authState.secured).is.false;
        });
    });
});
