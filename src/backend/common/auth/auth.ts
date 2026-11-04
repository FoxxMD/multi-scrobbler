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

/*
 * NOTES FOR FUTURE AUTH FEATURES (researched against better-auth 1.7.15)
 *
 * None of these need schema changes to existing tables. Everything below is either already in the schema
 * or a brand new table (plain CREATE TABLE migration). Changing columns on users/accounts makes drizzle-kit
 * generate a table rebuild whose DROP TABLE cascade-deletes everything referencing users, so avoid that.
 *
 * == Generic OAuth 2.0 / OIDC (genericOAuth from better-auth/plugins) ==
 * https://better-auth.com/docs/plugins/generic-oauth
 * - No schema. Providers are config-only, logins are rows in `accounts` (providerId + accountId = provider's `sub`).
 *   OAuth state/PKCE is stored in `verifications` (default storeStateStrategy: "database").
 * - User matching (better-auth/dist/oauth2/link-account.mjs): first by providerId+accountId, then fallback
 *   findUserByEmail(email.toLowerCase()). The email fallback only links implicitly if the provider says the email is
 *   verified or the provider is in account.accountLinking.trustedProviders. See also disableImplicitLinking,
 *   disableImplicitSignUp, overrideUserInfo, updateUserInfoOnLink.
 * - There is NO matching by username and genericOAuth never reads `preferred_username`. Populating users.username from
 *   preferred_username, or matching an existing user by username (authelia/authentik style), needs custom code
 *   (getUserInfo / mapProfileToUser / a hook). OAuth-created users bypass the username plugin's validation and
 *   normalization, so apply the same rules as USERNAME_REGEX in owner.ts (IdP usernames can contain '-' or '@').
 * - users.email is NOT NULL UNIQUE, so a provider that returns no email must get a placeholder from code.
 *   Use placeholderEmail(user id) from owner.ts, never a username-based one (usernames can change and collide).
 * - Users without a real email have placeholderEmail(id) with emailVerified: false. Detect them by
 *   email.endsWith('@' + PLACEHOLDER_EMAIL_DOMAIN), no flag column needed. Swapping in a real email is a row update.
 * - Implicit linking (first IdP login -> existing user by email) also requires the LOCAL user's emailVerified
 *   (account.accountLinking.requireLocalEmailVerified, default true). MS sends no email, so users cannot verify one. Ways to link:
 *   1. Explicit linking (simplest, no email needed): logged in user clicks "link <provider>" in Account settings -> authClient.linkSocial.
 *      Placeholders can stay forever.
 *   2. Implicit by email: user needs a real email AND either an admin sets it + marks it verified, or
 *      requireLocalEmailVerified: false with the (self-hosted) IdP in trustedProviders, so the IdP's email claim is trusted.
 *      To let users enter their own email use user.changeEmail {enabled: true, updateEmailWithoutVerification: true},
 *      which only applies while the user is unverified (why placeholders must stay emailVerified: false).
 *   3. By username: custom code, see above. Email is irrelevant.
 * - Decide on account.encryptOAuthTokens BEFORE releasing OAuth. Enabling it later leaves already stored tokens in plaintext.
 *   It derives from the auth secret, which lives in its own file, so encrypted tokens stay valid across db copies only with that file.
 * - Optional: unique index on accounts(providerId, accountId). better-auth looks accounts up by that pair but does not
 *   enforce uniqueness. Additive (CREATE UNIQUE INDEX), can be added any time.
 *
 * == SSO (@better-auth/sso), only if providers should be registered at runtime from the dashboard ==
 * https://better-auth.com/docs/plugins/sso
 * - Adds a new `ssoProvider` table (additive). OIDC claim mapping (oidcConfig.mapping) has email/emailVerified/name/image/extraFields,
 *   no username mapping, same custom-code caveat as above.
 *
 * == Passkeys (@better-auth/passkey) ==
 * https://better-auth.com/docs/plugins/passkey
 * - Adds a new `passkey` table (additive): name, publicKey, userId -> users (cascade), credentialID, counter, deviceType,
 *   backedUp, transports, createdAt, aaguid. Regenerate with `npx auth generate` and diff, the docs page omits the fields.
 * - WebAuthn needs a secure context and a domain rpID. Bare IPs (192.168.x.x:9078) cannot be an rpID, so passkeys only
 *   work through a domain over https or localhost. Set rpID/origin explicitly since baseURL.allowedHosts can be a wildcard.
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
        user: {
            additionalFields: {
                // generated by the drizzle schema ($defaultFn), input: false so it cannot be set through /update-user
                publicId: {type: 'string', required: false, input: false},
            },
        },
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
