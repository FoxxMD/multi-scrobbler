import type { RequestHandler, Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Logger } from "@foxxmd/logging";
import type { MSAuth } from "../common/auth/auth.ts";
import type { AuthSettings } from "../common/auth/authSettings.ts";
import type { AuthStateStore } from "../common/auth/authState.ts";
import type { SecurityRequirement, SecurityScheme } from "@minisylar/express-typed-router";
import { CLIENT_IP_HEADER, CLIENT_PUBLIC_HEADER, isRecognizedHost, requestHost, sameOriginMiddleware } from "./middleware.ts";

/**
 * How a request was authenticated
 *
 * * session  -- better-auth session (cookie, or any future better-auth plugin that resolves a session)
 * * apiKey -- API key (`Authorization: Bearer ms_...`), limited by its scope
 * * unsecured -- (see below) read-only when the request uses a host that could be DNS rebinding
 * * unsecured -- instance has not been secured yet so every request acts as the owner, same as before auth existed
 * * disabled -- AUTH_MODE=disabled, every request acts as the owner
 * */
export type AuthVia = 'session' | 'apiKey' | 'unsecured' | 'disabled';

/**
 * What an API key may do
 *
 * * read -- safe methods only (GET, HEAD, OPTIONS)
 * * write -- everything
 * */
export type ApiKeyScope = 'read' | 'write';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Scope is stored in the key's metadata, set when the key is created from the dashboard.
 * Anything other than 'write' is read so a malformed key can never do more than read.
 *
 * ponytail: metadata is client-settable but only by the owner's session, who can create write keys anyway.
 * Move to the plugin's server-only `permissions` (custom create endpoint) once there are multiple users or finer scopes.
 * */
export const apiKeyScope = (metadata: unknown): ApiKeyScope => (metadata as {scope?: unknown} | null)?.scope === 'write' ? 'write' : 'read';

export interface RequestAuth {
    userId: string
    via: AuthVia
    /** only set for API keys, and unsecured access through an unrecognized host */
    scope?: ApiKeyScope
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
    apiKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key created in the dashboard under Settings -> Account. Read keys can only use GET requests, Write keys can use everything. Only required once the instance is secured (an admin password is set).',
    },
};

/** docs security for routes that require auth */
export const SECURITY_REQUIRED: SecurityRequirement[] = [{session: []}, {apiKey: []}];
/** docs security for public routes */
export const SECURITY_PUBLIC: SecurityRequirement[] = [];

const bearerToken = (req: Request): string | undefined => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

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
 * Resolve the actor for a request into req.auth (left undefined if anonymous).
 *
 * Actor resolution chain: disabled -> API key (bearer) -> better-auth session (cookie) -> unsecured (owner).
 *
 * An invalid API key is logged as `Invalid API key from <ip>` (for fail2ban/CrowdSec) and the request stays anonymous.
 * New auth methods should resolve through better-auth (getSession) or add a step here.
 * */
const PUBLIC_WARN_INTERVAL = 60 * 60 * 1000;

export const resolveAuth = (opts: Pick<RequireAuthOptions, 'auth' | 'settings' | 'state' | 'logger'>) => {
    const {auth, settings, state, logger} = opts;
    let lastPublicWarn = 0;
    return async (req: Request): Promise<void> => {
        try {
            if (settings.mode === 'disabled') {
                req.auth = {userId: state.ownerId, via: 'disabled'};
                return;
            }
            const key = bearerToken(req);
            if (key !== undefined) {
                const result = await auth.api.verifyApiKey({body: {key}, headers: fromNodeHeaders(req.headers)});
                if (result.valid && result.key !== null) {
                    req.auth = {userId: result.key.referenceId, via: 'apiKey', scope: apiKeyScope(result.key.metadata)};
                    return;
                }
                logger.warn(`Invalid API key from ${req.headers[CLIENT_IP_HEADER] ?? req.socket.remoteAddress ?? 'unknown'}: ${result.error?.code ?? 'unknown'}`);
            } else if (req.headers.cookie !== undefined) {
                const result = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
                if (result !== null) {
                    req.auth = {userId: result.user.id, via: 'session', user: result.user, session: result.session};
                    return;
                }
            }
            if (!state.secured) {
                // a malicious website can point its own domain at this instance (DNS rebinding) and act as the owner from a LAN user's browser.
                // Only hosts that can't be rebound get full access, others are read-only until the instance is secured
                const recognized = isRecognizedHost(requestHost((x) => req.get(x), settings.trustProxy), settings);
                req.auth = {userId: state.ownerId, via: 'unsecured', ...(recognized ? {} : {scope: 'read'})};
                if (req.headers[CLIENT_PUBLIC_HEADER] === '1' && Date.now() - lastPublicWarn > PUBLIC_WARN_INTERVAL) {
                    lastPublicWarn = Date.now();
                    const forwarded = req.get('x-forwarded-for')?.split(',').at(-1)?.trim();
                    const from = `${req.headers[CLIENT_IP_HEADER] ?? 'unknown'}${forwarded ? ` (forwarded for ${forwarded})` : ''}`;
                    logger.warn(`Unsecured instance was used from ${from}, which looks like a public IP. This instance may be reachable from the internet and anyone who can reach it can use it. Set an admin password to secure it.`);
                }
            }
        } catch (e) {
            logger.warn(new Error('Failed to resolve request session', {cause: e}));
        }
    }
}

/**
 * Resolve the actor (req.auth) but never reject. For public routes that show more to a logged in user.
 * */
export const optionalAuth = (opts: Pick<RequireAuthOptions, 'auth' | 'settings' | 'state' | 'logger'>): RequestHandler => {
    const resolve = resolveAuth(opts);
    return async (req, res, next) => {
        await resolve(req);
        next();
    }
}

/**
 * Require an actor for the request, resolved into req.auth.
 *
 * Self-contained: everything it needs is passed in, so it can be used as router-level middleware
 * (all routes on that router need auth) or per-route (route options `middleware`).
 * */
export const requireAuth = (opts: RequireAuthOptions): RequestHandler => {
    const {settings, basePath} = opts;
    const sameOrigin = sameOriginMiddleware({trustProxy: settings.trustProxy});

    const resolve = resolveAuth(opts);

    return async (req, res, next) => {
        await resolve(req);

        if (req.auth === undefined) {
            if (req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
                res.status(401).type('html').send(unauthorizedPage(req.get('host') ?? 'this address', basePath));
                return;
            }
            res.status(401).json({error: 'Authentication required', code: 'auth_required'});
            return;
        }

        if (req.auth.scope === 'read' && !SAFE_METHODS.includes(req.method)) {
            if (req.auth.via === 'unsecured') {
                res.status(403).json({
                    error: `This instance is not secured and is being used through a host it does not recognize (${requestHost((x) => req.get(x), settings.trustProxy) ?? 'unknown'}), so it is read-only. Set an admin password, or add the host to ALLOWED_HOSTS or BASE_URL.`,
                    code: 'unsecured_read_only'
                });
                return;
            }
            res.status(403).json({error: 'API key is read-only', code: 'insufficient_scope'});
            return;
        }

        if (req.auth.via === 'apiKey') {
            // a key is sent explicitly by the caller, a browser never attaches it on its own
            next();
            return;
        }
        // session cookies, and unsecured/disabled instances (where being able to reach the instance *is* the credential),
        // are ambient: a malicious page in the user's browser could use them. Reject cross-site requests (safe methods are passed through)
        sameOrigin(req, res, next);
    }
}
