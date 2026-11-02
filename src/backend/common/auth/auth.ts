import * as path from "node:path";
import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Logger } from "@foxxmd/logging";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import { authSchema } from "../database/drizzle/schema/auth.ts";
import type { AuthSettings } from "./authSettings.ts";

export interface CreateAuthOptions {
    /** pathname the app is mounted under, '/' at root */
    basePath: string
    logger: Logger
}

export const authBasePath = (basePath: string) => path.posix.join(basePath, '/api/auth');

/**
 * Build the better-auth instance used for all authentication.
 *
 * Extending auth (OIDC, API keys, bearer, JWT...) should happen by adding better-auth plugins here.
 * Anything that resolves through auth.api.getSession is picked up by the route guard automatically.
 * */
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
        emailAndPassword: {
            enabled: true,
            // users are only created by MS (owner bootstrap) or, in the future, by an admin
            disableSignUp: true,
        },
        plugins: [
            username(),
            admin({
                defaultRole: 'user',
                adminRoles: ['admin'],
            }),
        ],
        telemetry: {
            enabled: false
        },
        advanced: {
            useSecureCookies: settings.secureCookies,
            trustedProxyHeaders: settings.trustProxy,
            cookiePrefix: 'ms',
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
