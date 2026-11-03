import * as path from "node:path";
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { CLIENT_IP_HEADER } from "../../server/middleware.ts";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Logger } from "@foxxmd/logging";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import { authSchema } from "../database/drizzle/schema/auth.ts";
import type { AuthSettings } from "./authSettings.ts";
import { setupPlugin } from "./setupPlugin.ts";

export interface CreateAuthOptions {
    /** pathname the app is mounted under, '/' at root */
    basePath: string
    logger: Logger
    /** called after setup endpoints change auth state (first password) */
    onStateChange?: () => Promise<unknown>
}

export const authBasePath = (basePath: string) => path.posix.join(basePath, '/api/auth');

/**
 * Build the better-auth instance used for all authentication.
 *
 * Extending auth (OIDC, API keys, bearer, JWT...) should happen by adding better-auth plugins here.
 * Anything that resolves through auth.api.getSession is picked up by the route guard automatically.
 * */
/** keep user-supplied values on one line so they can't forge log entries */
const logSafe = (val: unknown) => JSON.stringify(typeof val === 'string' ? val : String(val ?? ''));

/**
 * Log logins, failed logins and first password setup with the client IP, in a stable format fail2ban/CrowdSec can match on:
 *
 * * `Login failed for user "<username>" from <ip>: <reason>`
 * * `Login succeeded for user "<username>" from <ip>`
 * * `Admin password setup failed from <ip>: <reason>` (wrong setup token...)
 * * `Admin password set from the dashboard by <ip>`
 * */
export const loginAuditHook = (logger: Logger) => createAuthMiddleware(async (ctx) => {
    const ip = ctx.headers?.get(CLIENT_IP_HEADER) ?? 'unknown';
    const failed = isAPIError(ctx.context.returned);
    if (ctx.path.startsWith('/sign-in/')) {
        const user = logSafe((ctx.body as {username?: string, email?: string} | undefined)?.username ?? (ctx.body as {email?: string} | undefined)?.email);
        if (failed) {
            logger.warn(`Login failed for user ${user} from ${ip}: ${(ctx.context.returned as Error).message}`);
        } else {
            logger.info(`Login succeeded for user ${user} from ${ip}`);
        }
    } else if (ctx.path === '/setup/password') {
        if (failed) {
            logger.warn(`Admin password setup failed from ${ip}: ${(ctx.context.returned as Error).message}`);
        } else {
            logger.info(`Admin password set from the dashboard by ${ip}`);
        }
    }
});

export const createAuth = (db: DbConcrete, settings: AuthSettings, opts: CreateAuthOptions) => {
    const { logger } = opts;
    return betterAuth({
        appName: 'multi-scrobbler',
        secret: settings.secret,
        basePath: authBasePath(opts.basePath),
        baseURL: {
            allowedHosts: settings.allowedHosts,
            protocol: 'auto',
            // without a fallback a request for a host not in allowedHosts is an unhandled error (500)
            // with it better-auth rejects with 403 Invalid origin
            ...(settings.hostsOpen ? {} : {fallback: settings.fallbackOrigin}),
        },
        database: drizzleAdapter(db, {
            provider: 'sqlite',
            schema: authSchema,
            usePlural: true,
        }),
        session: {
            expiresIn: settings.sessionExpiresIn,
            updateAge: settings.sessionUpdateAge,
        },
        emailAndPassword: {
            enabled: true,
            // users are only created by MS (owner bootstrap) or, in the future, by an admin
            disableSignUp: true,
        },
        plugins: [
            username(),
            // ponytail: admin plugin (roles, user management endpoints) left out until there is more than one user.
            // users.role and the ban/impersonation columns are kept so adding it back needs no migration
            setupPlugin({db, settings, logger, onStateChange: opts.onStateChange ?? (async () => undefined)}),
            apiKey({
                defaultPrefix: 'ms_',
                requireName: true,
                // holds the key scope, see apiKeyScope in requireAuth.ts
                enableMetadata: true,
                // the per-key default is 10 requests/day, which would break any scraper or script
                rateLimit: {enabled: false},
            }),
        ],
        hooks: {
            after: loginAuditHook(logger),
        },
        telemetry: {
            enabled: false
        },
        advanced: {
            useSecureCookies: settings.secureCookies,
            trustedProxyHeaders: settings.trustProxy,
            cookiePrefix: 'ms',
            ipAddress: {
                // better-auth reads X-Forwarded-For by default, which any client can forge to dodge the sign-in rate limit.
                // MS sets this header itself from the connection (or the proxy's X-Forwarded-For entry when TRUST_PROXY), see clientIpMiddleware
                ipAddressHeaders: [CLIENT_IP_HEADER],
            },
        },
        logger: {
            log: (level, message, ...args) => {
                const msg = args.length > 0 ? `${message} ${args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}` : message;
                switch (level) {
                    case 'error':
                        logger.error(msg);
                        break;
                    case 'warn':
                        logger.warn(msg);
                        break;
                    case 'info':
                        logger.verbose(msg);
                        break;
                    default:
                        logger.debug(msg);
                }
            }
        }
    });
}

export type MSAuth = ReturnType<typeof createAuth>;
