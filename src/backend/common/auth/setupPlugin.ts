import * as z from "zod";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import type { AuthSettings } from "./authSettings.ts";
import { computeAuthState } from "./authState.ts";
import { setUserPassword } from "./ownerPassword.ts";
import { secretMatches } from "../../server/middleware.ts";

export interface SetupPluginOptions {
    db: DbConcrete
    settings: Pick<AuthSettings, 'mode' | 'setupToken'>
    /** called after anything that changes auth state (password set) */
    onStateChange: () => Promise<unknown>
}

export interface SetupStatus {
    mode: AuthSettings['mode']
    secured: boolean
    passwordSet: boolean
    setupTokenRequired: boolean
    /** requester has a session for the owner */
    isOwner: boolean
    /** owner's username. Omitted once secured unless the requester is logged in as the owner, so it isn't handed to anyone guessing passwords */
    username?: string
}

const tokenMatches = (expected: string | undefined, given: string | undefined): boolean => expected === undefined || secretMatches(expected, given);

/**
 * Instance setup endpoints, as a better-auth plugin so they can create sessions and set signed session cookies.
 *
 * * GET  /setup/status   -- what the dashboard needs to decide between login and set-password screens
 * * POST /setup/password -- set the owner's *first* password. Afterwards use better-auth's change-password.
 * */
export const setupPlugin = (opts: SetupPluginOptions) => {
    const {db, settings, onStateChange} = opts;

    return {
        id: 'ms-setup',
        endpoints: {
            setupStatus: createAuthEndpoint('/setup/status', {method: 'GET'}, async (ctx) => {
                const state = await computeAuthState(db, ctx.context);
                const session = await getSessionFromCtx(ctx, {disableRefresh: true});
                const owner = await ctx.context.internalAdapter.findUserById(state.ownerId);
                const isOwner = session?.user.id === state.ownerId;
                return ctx.json<SetupStatus>({
                    mode: settings.mode,
                    secured: state.secured,
                    passwordSet: state.ownerHasPassword,
                    setupTokenRequired: settings.setupToken !== undefined,
                    isOwner,
                    username: state.secured && !isOwner ? undefined : (owner as {username?: string} | null)?.username ?? 'admin',
                });
            }),

            setupPassword: createAuthEndpoint('/setup/password', {
                method: 'POST',
                body: z.object({password: z.string(), token: z.string().optional()}),
            }, async (ctx) => {
                const state = await computeAuthState(db, ctx.context);
                if (state.ownerHasPassword) {
                    throw new APIError('CONFLICT', {message: 'Admin password is already set. Use change password instead.', code: 'PASSWORD_ALREADY_SET'});
                }
                const session = await getSessionFromCtx(ctx, {disableRefresh: true});
                const isOwner = session?.user.id === state.ownerId;
                if (!isOwner && !tokenMatches(settings.setupToken, ctx.body.token)) {
                    throw new APIError('FORBIDDEN', {message: 'Setup token is missing or incorrect. Find it in the multi-scrobbler logs.', code: 'INVALID_SETUP_TOKEN'});
                }
                try {
                    await setUserPassword(ctx.context, state.ownerId, ctx.body.password);
                } catch (e) {
                    throw new APIError('BAD_REQUEST', {message: (e as Error).message, code: 'INVALID_PASSWORD'});
                }
                if (!isOwner) {
                    // log in whoever just secured the instance
                    const user = await ctx.context.internalAdapter.findUserById(state.ownerId);
                    const newSession = await ctx.context.internalAdapter.createSession(state.ownerId);
                    await setSessionCookie(ctx, {session: newSession, user: user!});
                }
                await onStateChange();
                return ctx.json({ok: true});
            }),
        }
    } satisfies BetterAuthPlugin;
}
