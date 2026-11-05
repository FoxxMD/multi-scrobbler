import * as z from "zod";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import type { AuthSettings } from "./authSettings.ts";
import { computeAuthState } from "./authState.ts";
import { setUserPassword } from "./ownerPassword.ts";
import { CLIENT_PUBLIC_HEADER, isRecognizedHost, requestHost, secretMatches } from "../../server/middleware.ts";
import type { Logger } from "@foxxmd/logging";

export interface SetupPluginOptions {
    db: DbConcrete
    settings: Pick<AuthSettings, 'mode' | 'setupToken' | 'setupTokenAlways' | 'trustProxy' | 'allowedHosts' | 'hostsOpen' | 'fallbackOrigin'>
    logger: Logger
    /** called after anything that changes auth state (password set) */
    onStateChange: () => Promise<unknown>
}

export interface SetupStatus {
    mode: AuthSettings['mode']
    secured: boolean
    passwordSet: boolean
    setupTokenRequired: boolean
    /**
     * Why the setup token is required for this request
     *
     * * configured -- AUTH_SETUP_TOKEN is set
     * * public_ip -- the request looks like it comes from the internet
     * * host -- the request uses a host that could be DNS rebinding (unrecognized domain)
     * */
    setupTokenReason?: SetupTokenReason
    /** the request looks like it comes from the internet (only a signal, may be wrong) */
    publicClient: boolean
    /** host the request used */
    host?: string
    /** host can't be DNS rebinding. While unsecured, the API is read-only through other hosts */
    hostRecognized: boolean
    /** requester has a session for the owner */
    isOwner: boolean
    /** owner's username. Omitted once secured unless the requester is logged in as the owner, so it isn't handed to anyone guessing passwords */
    username?: string
}

export type SetupTokenReason = 'configured' | 'public_ip' | 'host';

type Headers = {get: (name: string) => string | null} | undefined;

const isPublic = (headers: Headers) => headers?.get(CLIENT_PUBLIC_HEADER) === '1';

const hostOf = (settings: SetupPluginOptions['settings'], headers: Headers) => requestHost((x) => headers?.get(x), settings.trustProxy);

const tokenReason = (settings: SetupPluginOptions['settings'], headers: Headers): SetupTokenReason | undefined => {
    if (settings.setupTokenAlways) {
        return 'configured';
    }
    if (isPublic(headers)) {
        return 'public_ip';
    }
    if (!isRecognizedHost(hostOf(settings, headers), settings)) {
        return 'host';
    }
    return undefined;
}

/** print the token again when someone is stuck without it, but not on every request of someone hammering the endpoint */
const TOKEN_REPRINT_INTERVAL = 5 * 60 * 1000;

/**
 * Instance setup endpoints, as a better-auth plugin so they can create sessions and set signed session cookies.
 *
 * * GET  /setup/status   -- what the dashboard needs to decide between login and set-password screens
 * * POST /setup/password -- set the owner's *first* password. Afterwards use better-auth's change-password.
 * */
export const setupPlugin = (opts: SetupPluginOptions) => {
    const {db, settings, onStateChange, logger} = opts;
    let lastReprint = 0;

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
                    setupTokenRequired: tokenReason(settings, ctx.headers) !== undefined,
                    setupTokenReason: tokenReason(settings, ctx.headers),
                    publicClient: isPublic(ctx.headers),
                    host: hostOf(settings, ctx.headers),
                    hostRecognized: isRecognizedHost(hostOf(settings, ctx.headers), settings),
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
                const reason = tokenReason(settings, ctx.headers);
                if (!isOwner && reason !== undefined && !secretMatches(settings.setupToken, ctx.body.token)) {
                    if (Date.now() - lastReprint > TOKEN_REPRINT_INTERVAL) {
                        lastReprint = Date.now();
                        logger.warn(`Setup token (required to secure this instance from the dashboard): ${settings.setupToken}`);
                    }
                    throw new APIError('FORBIDDEN', {message: 'Setup token is missing or incorrect. Find it in the multi-scrobbler console output (docker logs) or log file.', code: 'INVALID_SETUP_TOKEN'});
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
