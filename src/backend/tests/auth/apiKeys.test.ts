import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import type { Logger } from '@foxxmd/logging';
import type { ServerLocals } from '../../server/index.ts';
import { optionalAuth } from '../../server/requireAuth.ts';
import { clientIpMiddleware } from '../../server/middleware.ts';
import { buildAuthApp, createApiKey, secureApp, signIn } from '../utils/authTestUtils.ts';
import type ScrobbleSources from '../../sources/ScrobbleSources.ts';

const bearer = (key: string) => ['Authorization', `Bearer ${key}`] as const;

describe('API Keys', function () {

    it('read keys can only use safe methods', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const key = await createApiKey(app, await signIn(app), 'read');

        expect((await request(app).get('/api/components').set(...bearer(key))).status).eq(200);
        const write = await request(app).put('/api/logs').set(...bearer(key)).send({});
        expect(write.status).eq(403);
        expect(write.body.code).eq('insufficient_scope');
    });

    it('write keys can mutate', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const key = await createApiKey(app, await signIn(app), 'write');

        expect((await request(app).get('/api/components').set(...bearer(key))).status).eq(200);
        expect((await request(app).put('/api/logs').set(...bearer(key)).send({})).status).not.oneOf([401, 403]);
    });

    it('an unknown scope is treated as read', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const key = await createApiKey(app, await signIn(app), 'admin');

        expect((await request(app).get('/api/components').set(...bearer(key))).status).eq(200);
        expect((await request(app).put('/api/logs').set(...bearer(key)).send({})).status).eq(403);
    });

    it('invalid and deleted keys are rejected', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const cookie = await signIn(app);
        const key = await createApiKey(app, cookie, 'write');

        expect((await request(app).get('/api/components').set(...bearer('ms_notARealKey'))).status).eq(401);

        const list = await request(app).get('/api/auth/api-key/list').set('Cookie', cookie);
        const keyId = list.body.apiKeys[0].id;
        const del = await request(app).post('/api/auth/api-key/delete')
            .set('Host', 'localhost:9078')
            .set('Origin', 'http://localhost:9078')
            .set('Cookie', cookie)
            .send({keyId});
        expect(del.status).eq(200);
        expect((await request(app).get('/api/components').set(...bearer(key))).status).eq(401);
    });

    it('keys cannot manage auth (no better-auth session from a key)', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const key = await createApiKey(app, await signIn(app), 'write');

        const res = await request(app).post('/api/auth/api-key/create').set(...bearer(key)).send({name: 'escalate', metadata: {scope: 'write'}});
        expect(res.status).eq(401);
    });

    it('read keys see detailed health', async function () {
        const app = await buildAuthApp({}, async (sources: ScrobbleSources) => {
            sources.getStatusSummary = async () => [false, ['Source subsonic - mySecretServer is not polling.']];
        });
        await secureApp(app);
        const key = await createApiKey(app, await signIn(app), 'read');

        expect((await request(app).get('/api/health')).body.messages).eql([]);
        expect((await request(app).get('/api/health').set(...bearer(key))).body.messages).eql(['Source subsonic - mySecretServer is not polling.']);
    });

    it('logs invalid keys with the client IP', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const {auth, authSettings, authState} = app.locals as ServerLocals;
        const logs: string[] = [];
        const logger = {warn: (m: string) => logs.push(m), info: () => undefined, debug: () => undefined, verbose: () => undefined, error: () => undefined} as unknown as Logger;
        const probe = express();
        probe.use(clientIpMiddleware(), optionalAuth({auth, settings: authSettings, state: authState, logger}));
        probe.get('/', (req, res) => res.json({auth: req.auth ?? null}));

        const res = await request(probe).get('/').set(...bearer('ms_notARealKey')).set('X-Forwarded-For', '6.6.6.6');
        expect(res.body.auth).eq(null);
        expect(logs.find(m => m.startsWith('Invalid API key'))).match(/^Invalid API key from 127\.0\.0\.1: /);
    });
});
