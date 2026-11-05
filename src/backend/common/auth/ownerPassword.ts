import { createHmac } from "node:crypto";
import type { Logger } from "@foxxmd/logging";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import type { AuthContext } from "@better-auth/core";
import type { MSAuth } from "./auth.ts";
import { ensureOwner, getSetting, setSetting } from "./owner.ts";

export const RESET_FINGERPRINT_KEY = 'adminResetPwFingerprint';

export type PasswordContext = Pick<AuthContext, 'internalAdapter'> & {password: Pick<AuthContext['password'], 'hash' | 'config'>};

/** Accept either the better-auth instance or an endpoint/plugin context (ctx.context) */
const toContext = async (auth: MSAuth | PasswordContext): Promise<PasswordContext> => '$context' in auth ? await auth.$context : auth;

export const userHasPassword = async (auth: MSAuth | PasswordContext, userId: string): Promise<boolean> => {
    const ctx = await toContext(auth);
    return (await ctx.internalAdapter.findCredentialAccount(userId)) !== null;
}

/**
 * Set a user's password without needing a session, creating the credential account if the user does not have one yet
 * (the owner is created passwordless).
 * */
export const setUserPassword = async (auth: MSAuth | PasswordContext, userId: string, password: string, opts: {revokeSessions?: boolean} = {}): Promise<void> => {
    const ctx = await toContext(auth);
    const {minPasswordLength, maxPasswordLength} = ctx.password.config;
    if (password.length < minPasswordLength) {
        throw new Error(`Password must be at least ${minPasswordLength} characters`);
    }
    if (password.length > maxPasswordLength) {
        throw new Error(`Password must be at most ${maxPasswordLength} characters`);
    }
    const hash = await ctx.password.hash(password);
    const account = await ctx.internalAdapter.findCredentialAccount(userId);
    if (account === null) {
        await ctx.internalAdapter.linkAccount({userId, providerId: 'credential', accountId: userId, password: hash});
    } else {
        await ctx.internalAdapter.updatePassword(userId, hash);
    }
    if (opts.revokeSessions === true) {
        await ctx.internalAdapter.deleteUserSessions(userId);
    }
}

const fingerprint = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');

/**
 * Apply owner password ENVs on startup:
 *
 * * ADMIN_SETUP_PW -- initial setup only. Used only if the owner has no password yet, ignored afterwards so forgetting to remove it is harmless.
 * * ADMIN_RESET_PW -- explicit recovery. Sets the password and revokes all owner sessions.
 *   A fingerprint of the applied value is stored so an unchanged value is not re-applied on every restart.
 * */
export const applyOwnerPasswordEnv = async (auth: MSAuth, db: DbConcrete, secret: string, logger: Logger, env: NodeJS.ProcessEnv = process.env): Promise<void> => {
    const owner = await ensureOwner(db);
    const setupPw = env.ADMIN_SETUP_PW;
    const resetPw = env.ADMIN_RESET_PW;

    if (resetPw !== undefined && resetPw !== '') {
        logger.warn('ADMIN_RESET_PW is set! Remove it once you have logged in.');
        const fp = fingerprint(secret, resetPw);
        if (await getSetting<string>(db, RESET_FINGERPRINT_KEY) !== fp) {
            try {
                await setUserPassword(auth, owner.id, resetPw, {revokeSessions: true});
                await setSetting(db, RESET_FINGERPRINT_KEY, fp);
                logger.warn(`Password for admin '${owner.username}' was reset from ADMIN_RESET_PW and all of its sessions were logged out`);
            } catch (e) {
                logger.error(new Error('Could not reset admin password from ADMIN_RESET_PW', {cause: e}));
            }
        } else {
            logger.verbose('ADMIN_RESET_PW was already applied, not resetting again');
        }
        return;
    }

    if (setupPw !== undefined && setupPw !== '') {
        if (await userHasPassword(auth, owner.id)) {
            logger.verbose('ADMIN_SETUP_PW is ignored because admin already has a password. Use ADMIN_RESET_PW to reset it.');
            return;
        }
        try {
            await setUserPassword(auth, owner.id, setupPw);
            logger.info(`Password for admin '${owner.username}' was set from ADMIN_SETUP_PW`);
        } catch (e) {
            logger.error(new Error('Could not set admin password from ADMIN_SETUP_PW', {cause: e}));
        }
    }
}
