import type { RequestHandler, Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Logger } from "@foxxmd/logging";
import type { MSAuth } from "../common/auth/auth.ts";
import type { AuthSettings } from "../common/auth/authSettings.ts";
import type { AuthStateStore } from "../common/auth/authState.ts";
import type { SecurityRequirement, SecurityScheme } from "@minisylar/express-typed-router";
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

/** OpenAPI security scheme names, for router/route `docs.security` and the docs `securitySchemes` */
export const SECURITY_SCHEMES: Record<string, SecurityScheme> = {
    session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'ms.session_token',
        description: 'Session cookie set by logging in to the dashboard. Only required once the instance is secured (an admin password is set).',
    },
};

/** docs security for routes that require auth */
export const SECURITY_REQUIRED: SecurityRequirement[] = [{session: []}];
/** docs security for public routes */
export const SECURITY_PUBLIC: SecurityRequirement[] = [];

const hasCredentials = (req: Request) => req.headers.cookie !== undefined || req.headers.authorization !== undefined;

export interface RequireAuthOptions {
    auth: MSAuth
    settings: AuthSettings
    state: AuthStateStore
    logger: Logger
    /** pathname the app is mounted under, '/' at root. Used to link to the dashboard login */
    basePath: string
}

const escapeHtml = (str: string) => str.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Browser navigation to an API route (third-party auth callback redirects) gets a readable page instead of JSON.
 *
 * The session cookie only exists for the host the user logged in at, so the most likely cause is
 * the redirect URL using a different host than the one the dashboard is used from.
 * */
const unauthorizedPage = (host: string, basePath: string) => {
    const login = escapeHtml(`${basePath === '/' ? '' : basePath}/login`);
    const h = escapeHtml(host);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Log in required</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 40em; margin: 2em auto; padding: 0 1em; line-height: 1.5">
<h1>Log in required</h1>
<p>This page requires being logged in to multi-scrobbler at <strong>${h}</strong>.</p>
<p><a href="${login}">Log in to the dashboard at ${h}</a>, then try again.</p>
<p>If you were authenticating a Source or Client, start the authentication again from the dashboard after logging in. The redirect (callback) URL configured for it must use the same host you use for the dashboard (<strong>${h}</strong>), otherwise you will not be logged in when the redirect returns here.</p>
</body></html>`;
}

/**
 * Require an actor for the request, resolved into req.auth.
 *
 * Self-contained: everything it needs is passed in, so it can be used as router-level middleware
 * (all routes on that router need auth) or per-route (route options `middleware`).
 *
 * Actor resolution chain: disabled -> better-auth session -> unsecured (owner).
 * New auth methods should resolve through better-auth (getSession) or add a step here.
 * */
export const requireAuth = (opts: RequireAuthOptions): RequestHandler => {
    const {auth, settings, state, logger, basePath} = opts;
    const sameOrigin = sameOriginMiddleware({trustProxy: settings.trustProxy});

    return async (req, res, next) => {
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

        if (req.auth === undefined) {
            if (req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
                res.status(401).type('html').send(unauthorizedPage(req.get('host') ?? 'this address', basePath));
                return;
            }
            res.status(401).json({error: 'Authentication required', code: 'auth_required'});
            return;
        }

        if (req.auth.via === 'session') {
            // ambient cookie auth needs CSRF protection (safe methods are passed through)
            sameOrigin(req, res, next);
            return;
        }
        next();
    }
}
