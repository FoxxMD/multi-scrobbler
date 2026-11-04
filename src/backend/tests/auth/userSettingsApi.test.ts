import { expect } from 'chai';
import request from 'supertest';
import type { ServerLocals } from '../../server/index.ts';
import { buildAuthApp, createApiKey, secureApp, signIn } from '../utils/authTestUtils.ts';

describe('User Settings API', function () {

    it('gets and sets own settings with me or user id', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const cookie = await signIn(app);
        const {authState} = app.locals as ServerLocals;

        const unset = await request(app).get('/api/user/me/setting/theme').set('Cookie', cookie);
        expect(unset.status).eq(200);
        expect(unset.body).eql({key: 'theme', value: null});

        const put = await request(app).put('/api/user/me/setting/theme').set('Cookie', cookie).send({value: 'dark'});
        expect(put.status).eq(200);
        expect(put.body).eql({key: 'theme', value: 'dark'});

        const byId = await request(app).get(`/api/user/${authState.ownerId}/setting/theme`).set('Cookie', cookie);
        expect(byId.body.value).eq('dark');
    });

    it('lists all settings and resets one', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const cookie = await signIn(app);

        expect((await request(app).get('/api/user/me/setting').set('Cookie', cookie)).body).eql({});
        await request(app).put('/api/user/me/setting/theme').set('Cookie', cookie).send({value: 'light'});
        expect((await request(app).get('/api/user/me/setting').set('Cookie', cookie)).body).eql({theme: 'light'});

        const del = await request(app).delete('/api/user/me/setting/theme').set('Cookie', cookie);
        expect(del.status).eq(200);
        expect(del.body).eql({key: 'theme', value: null});
        expect((await request(app).get('/api/user/me/setting/theme').set('Cookie', cookie)).body.value).is.null;

        expect((await request(app).get('/api/user/someoneElse/setting').set('Cookie', cookie)).status).eq(403);
        expect((await request(app).delete('/api/user/someoneElse/setting/theme').set('Cookie', cookie)).status).eq(403);
        expect((await request(app).delete('/api/user/me/setting/nope').set('Cookie', cookie)).status).eq(404);
    });

    it('rejects other users, unknown keys and invalid values', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        const cookie = await signIn(app);

        expect((await request(app).get('/api/user/someoneElse/setting/theme').set('Cookie', cookie)).status).eq(403);
        expect((await request(app).put('/api/user/someoneElse/setting/theme').set('Cookie', cookie).send({value: 'dark'})).status).eq(403);
        expect((await request(app).get('/api/user/me/setting/nope').set('Cookie', cookie)).status).eq(404);

        const invalid = await request(app).put('/api/user/me/setting/theme').set('Cookie', cookie).send({value: 'purple'});
        expect(invalid.status).eq(400);
        expect(invalid.body.error).include('theme');
    });

    it('requires auth once secured and a write scope to change', async function () {
        const app = await buildAuthApp();
        await secureApp(app);
        expect((await request(app).get('/api/user/me/setting/theme')).status).eq(401);

        const key = await createApiKey(app, await signIn(app), 'read');
        const auth = ['Authorization', `Bearer ${key}`] as const;
        expect((await request(app).get('/api/user/me/setting/theme').set(...auth)).status).eq(200);
        expect((await request(app).put('/api/user/me/setting/theme').set(...auth).send({value: 'dark'})).status).eq(403);
        expect((await request(app).delete('/api/user/me/setting/theme').set(...auth)).status).eq(403);
    });
});
