import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import type { Express } from 'express';
import type { PlayObject } from '../../../core/Atomic.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer } from '../../server/index.ts';
import { fastPasswordHasher, secureApp, signIn } from '../utils/authTestUtils.ts';

const internalConfig = { localUrl: new URL('http://localhost:9078'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' };
const playBody = { track: { name: 'Track' }, artists: [{ name: 'Artist' }] };

// minimal stand-in, scrobble() only needs name, uid, logger and queuePlay
const fakeClient = (name: string) => {
    const queued: PlayObject[] = [];
    return {
        name,
        queued,
        logger: loggerTest,
        getUid: () => `fake-${name}`,
        queuePlay: (p: PlayObject) => { queued.push(p); }
    };
};

const build = async () => {
    const a = fakeClient('a');
    const b = fakeClient('b');
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    clients.clients.push(a as never, b as never);
    const [app] = await initServer({ sources, clients }, { testMode: true, passwordHasher: fastPasswordHasher });
    await secureApp(app as Express);
    const cookie = await signIn(app as Express);
    return { app: app as Express, cookie, a, b };
};

describe('Manual Scrobble Endpoint', function () {

    it('scrobbles to all clients as a manual play, defaulting playDate to now', async function () {
        const { app, cookie, a, b } = await build();
        const res = await request(app).post('/api/scrobble').set('Cookie', cookie).send({ play: playBody });
        expect(res.status).eq(202);
        expect(res.body).eql({ queued: ['fake-a', 'fake-b'] });
        expect(a.queued).length(1);
        expect(b.queued).length(1);
        expect(a.queued[0].meta.source).eq('manual');
        expect(Math.abs(dayjs().diff(a.queued[0].data.playDate, 'second'))).lessThan(5);
    });

    it('keeps a past playDate the user sends', async function () {
        const { app, cookie, a } = await build();
        const playDate = dayjs().subtract(2, 'hour').toISOString();
        const res = await request(app).post('/api/scrobble').set('Cookie', cookie).send({ play: { ...playBody, playDate } });
        expect(res.status).eq(202);
        expect(dayjs(a.queued[0].data.playDate).toISOString()).eq(playDate);
    });

    it('scrobbles only to the requested client ids', async function () {
        const { app, cookie, a, b } = await build();
        const res = await request(app).post('/api/scrobble').set('Cookie', cookie).send({ play: playBody, clients: ['fake-b'] });
        expect(res.status).eq(202);
        expect(res.body).eql({ queued: ['fake-b'] });
        expect(a.queued).length(0);
        expect(b.queued).length(1);
    });

    it('rejects a playDate more than 1 minute in the future', async function () {
        const { app, cookie, a } = await build();
        const res = await request(app).post('/api/scrobble').set('Cookie', cookie)
            .send({ play: { ...playBody, playDate: dayjs().add(5, 'minute').toISOString() } });
        expect(res.status).eq(400);
        expect(res.body.error).is.a('string');
        expect(a.queued).length(0);
    });

    it('rejects missing track name or artists', async function () {
        const { app, cookie } = await build();
        const noName = await request(app).post('/api/scrobble').set('Cookie', cookie).send({ play: { artists: playBody.artists } });
        expect(noName.status).eq(400);
        const noArtists = await request(app).post('/api/scrobble').set('Cookie', cookie).send({ play: { track: playBody.track, artists: [] } });
        expect(noArtists.status).eq(400);
    });

    it('rejects unknown client ids', async function () {
        const { app, cookie, a } = await build();
        const res = await request(app).post('/api/scrobble').set('Cookie', cookie).send({ play: playBody, clients: ['nope'] });
        expect(res.status).eq(400);
        expect(res.body.error).include('nope');
        expect(a.queued).length(0);
    });

    it('rejects when not logged in', async function () {
        const { app } = await build();
        const res = await request(app).post('/api/scrobble').send({ play: playBody });
        expect(res.status).eq(401);
    });
});
