import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import type { Express } from 'express';
import request from 'supertest';
import { initServer, type ServerOptions, type ServerLocals } from '../../server/index.ts';
import { setUserPassword } from '../../common/auth/ownerPassword.ts';

const internalConfig = { localUrl: new URL('http://localhost:9078'), configDir: 'fake', logger: loggerTest, version: 'test' };

/** Build a test-mode server app. Auth instance, settings and db are available on app.locals (ServerLocals) */
export const buildAuthApp = async (opts: ServerOptions = {}, setup?: (sources: ScrobbleSources) => Promise<void>) => {
    const [app] = await buildAuthAppRouter(opts, setup);
    return app;
};

export const buildAuthAppRouter = async (opts: ServerOptions = {}, setup?: (sources: ScrobbleSources) => Promise<void>) => {
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    if (setup !== undefined) {
        await setup(sources);
    }
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    return initServer({ sources, clients }, { testMode: true, ...opts });
};

/** Give the owner a password so the instance is secured */
export const secureApp = async (app: Express, password = 'ownerPassword') => {
    const {auth, authState} = app.locals as ServerLocals;
    await setUserPassword(auth, authState.ownerId, password);
    await authState.refresh();
    return password;
}

/** Sign in as owner and return the session cookie(s) */
export const signIn = async (app: Express, password = 'ownerPassword') => {
    const res = await request(app).post('/api/auth/sign-in/username').send({username: 'admin', password});
    if (res.status !== 200) {
        throw new Error(`Sign in failed with ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.headers['set-cookie'] as unknown as string[];
}

/** Create an API key for the signed in owner and return the full key */
export const createApiKey = async (app: Express, cookie: string[], scope: unknown = 'read', name = 'test') => {
    const res = await request(app).post('/api/auth/api-key/create')
        .set('Host', 'localhost:9078')
        .set('Origin', 'http://localhost:9078')
        .set('Cookie', cookie)
        .send({name, metadata: {scope}});
    if (res.status !== 200) {
        throw new Error(`Create API key failed with ${res.status}: ${JSON.stringify(res.body)}`);
    }
    return res.body.key as string;
}
