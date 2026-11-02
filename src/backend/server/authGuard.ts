import type { RequestHandler, Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Logger } from "@foxxmd/logging";
import type { MSAuth } from "../common/auth/auth.ts";
import type { AuthSettings } from "../common/auth/authSettings.ts";
import type { AuthStateStore } from "../common/auth/authState.ts";
import { sameOriginMiddleware } from "./middleware.ts";

/**
 * How a request was authenticated
 *
 * * session  -- better-auth session (cookie, or any future better-auth plugin that resolves a session: bearer, api key sessions...)
 * * unsecured -- instance has not been secured yet so every request acts as the owner, same as before auth existed
 * * disabled -- AUTH_MODE=disabled, every request acts as the owner
 * */
export type AuthVia = 'session' | 'unsecured' | 'disabled';

export interface RequestAuth {
    userId: string
    via: AuthVia
    user?: Awaited<ReturnType<MSAuth['api']['getSession']>> extends infer S ? S extends {user: infer U} ? U : never : never
    session?: Awaited<ReturnType<MSAuth['api']['getSession']>> extends infer S ? S extends {session: infer U} ? U : never : never
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** Resolved actor for this request, undefined if anonymous */
            auth?: RequestAuth
        }
    }
}

/**
 * * public -- never requires auth (ingress, third-party auth callbacks, health/metrics, auth endpoints)
 * * optionalAuth -- read-only, public for now. Actor is still resolved so handlers can trim responses for anonymous callers in the future
 * * user -- requires an actor once the instance is secured
 * */
export type RoutePolicy = 'public' | 'optionalAuth' | 'user';

/**
 * Paths (relative to the base path) that are always public.
 *
 * Only /api/* is ever guarded so the dashboard SPA, static assets, docs and non-/api ingress paths
 * (Listenbrainz /1/*, Last.fm /2.0/) are public by default.
 * */
export const PUBLIC_ROUTES: RegExp[] = [
    // better-auth
    /^\/api\/auth(\/|$)/,
    // instance setup (enforces its own rules)
    /^\/api\/setup(\/|$)/,
    // ingress Sources, they have their own authentication
    /^\/api\/listenbrainz/,
    /^\/api\/lastfm/,
    /^\/api\/webscrobbler/,
    // third party auth callbacks (spotify, lastfm, librefm, deezer, mixcloud, ytmusic...)
    /callback$/,
    // automation: docker healthchecks, uptime monitors, prometheus
    /^\/api\/health$/,
    /^\/api\/version$/,
    /^\/api\/metrics$/,
];

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export const getRoutePolicy = (path: string, method: string): RoutePolicy => {
    if (!path.startsWith('/api/') || PUBLIC_ROUTES.some(x => x.test(path))) {
        return 'public';
    }
    if (READ_METHODS.includes(method.toUpperCase())) {
        return 'optionalAuth';
    }
    return 'user';
}

const hasCredentials = (req: Request) => req.headers.cookie !== undefined || req.headers.authorization !== undefined;

export interface AuthGuardOptions {
    auth: MSAuth
    settings: AuthSettings
    state: AuthStateStore
    logger: Logger
}

/**
 * Resolve the actor for a request and enforce the route policy.
 *
 * Actor resolution chain: disabled -> better-auth session -> unsecured (owner).
 * New auth methods should resolve through better-auth (getSession) or add a step here.
 * */
export const authGuardMiddleware = (opts: AuthGuardOptions): RequestHandler => {
    const {auth, settings, state, logger} = opts;
    const sameOrigin = sameOriginMiddleware({trustProxy: settings.trustProxy});

    return async (req, res, next) => {
        const policy = getRoutePolicy(req.path, req.method);
        if (policy === 'public') {
            next();
            return;
        }

        try {
            if (settings.mode === 'disabled') {
                req.auth = {userId: state.ownerId, via: 'disabled'};
            } else {
                if (hasCredentials(req)) {
                    const result = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
                    if (result !== null) {
                        req.auth = {userId: result.user.id, via: 'session', user: result.user, session: result.session};
                    }
                }
                if (req.auth === undefined && !state.secured) {
                    req.auth = {userId: state.ownerId, via: 'unsecured'};
                }
            }
        } catch (e) {
            logger.warn(new Error('Failed to resolve request session', {cause: e}));
        }

        if (policy === 'user' && req.auth === undefined) {
            res.status(401).json({error: 'Authentication required', code: 'auth_required'});
            return;
        }

        if (policy === 'user' && req.auth?.via === 'session') {
            // ambient cookie auth needs CSRF protection
            sameOrigin(req, res, next);
            return;
        }
        next();
    }
}
