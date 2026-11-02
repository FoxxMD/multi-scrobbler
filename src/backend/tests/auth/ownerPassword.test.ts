import { expect } from 'chai';
import request from 'supertest';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { createAuth } from '../../common/auth/auth.ts';
import { resolveAuthSettings } from '../../common/auth/authSettings.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { applyOwnerPasswordEnv, userHasPassword } from '../../common/auth/ownerPassword.ts';
import { buildAuthApp } from '../utils/authTestUtils.ts';
import type { ServerLocals } from '../../server/index.ts';

const makeAuth = async () => {
    const db = await transientDb();
    const settings = resolveAuthSettings({localUrl: new URL('http://localhost:9078'), hasDefinedBaseUrl: false, env: {}});
    const auth = createAuth(db, settings, {basePath: '/', logger: loggerTest});
    return {db, settings, auth};
}

const verify = async (auth: Awaited<ReturnType<typeof makeAuth>>['auth'], userId: string, pw: string) => {
    const ctx = await auth.$context;
    const acc = await ctx.internalAdapter.findCredentialAccount(userId);
    return ctx.password.verify({hash: acc!.password!, password: pw});
}

describe('Owner Password ENV', function () {

    it('ADMIN_SETUP_PW sets password only when none exists', async function () {
        const {db, settings, auth} = await makeAuth();
        const owner = await ensureOwner(db);
        expect(await userHasPassword(auth, owner.id)).is.false;

        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_SETUP_PW: 'firstPassword'});
        expect(await verify(auth, owner.id, 'firstPassword')).is.true;

        // forgotten env with a different value does not change anything
        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_SETUP_PW: 'secondPassword'});
        expect(await verify(auth, owner.id, 'firstPassword')).is.true;
    });

    it('ADMIN_SETUP_PW that is too short is not applied', async function () {
        const {db, settings, auth} = await makeAuth();
        const owner = await ensureOwner(db);
        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_SETUP_PW: 'short'});
        expect(await userHasPassword(auth, owner.id)).is.false;
    });

    it('ADMIN_RESET_PW resets once, revokes sessions, and is not re-applied', async function () {
        const {db, settings, auth} = await makeAuth();
        const owner = await ensureOwner(db);
        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_SETUP_PW: 'firstPassword'});
        const ctx = await auth.$context;
        await ctx.internalAdapter.createSession(owner.id);
        expect(await ctx.internalAdapter.listSessions(owner.id)).length(1);

        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_RESET_PW: 'resetPassword'});
        expect(await verify(auth, owner.id, 'resetPassword')).is.true;
        expect(await ctx.internalAdapter.listSessions(owner.id)).length(0);

        // user logs in and changes password, restart with same reset value does nothing
        await ctx.internalAdapter.createSession(owner.id);
        await ctx.internalAdapter.updatePassword(owner.id, await ctx.password.hash('changedByUser'));
        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_RESET_PW: 'resetPassword'});
        expect(await verify(auth, owner.id, 'changedByUser')).is.true;
        expect(await ctx.internalAdapter.listSessions(owner.id)).length(1);

        // a new reset value is applied
        await applyOwnerPasswordEnv(auth, db, settings.secret, loggerTest, {ADMIN_RESET_PW: 'anotherReset'});
        expect(await verify(auth, owner.id, 'anotherReset')).is.true;
    });

    it('owner can sign in with username after password is set', async function () {
        const app = await buildAuthApp();
        const {auth, db, authSettings} = app.locals as ServerLocals;
        await applyOwnerPasswordEnv(auth, db, authSettings.secret, loggerTest, {ADMIN_SETUP_PW: 'firstPassword'});

        const bad = await request(app).post('/api/auth/sign-in/username').send({username: 'admin', password: 'wrongPassword'});
        expect(bad.status).eq(401);

        const res = await request(app).post('/api/auth/sign-in/username').send({username: 'admin', password: 'firstPassword'});
        expect(res.status).eq(200);
        const cookie = res.headers['set-cookie'] as unknown as string[];
        expect(cookie.some(x => x.startsWith('ms.session_token='))).is.true;
        // http by default, cookie must not be Secure or the browser drops it
        expect(cookie.some(x => /;\s*secure/i.test(x))).is.false;

        const session = await request(app).get('/api/auth/get-session').set('Cookie', cookie);
        expect(session.body.user.username).eq('admin');
    });
});
