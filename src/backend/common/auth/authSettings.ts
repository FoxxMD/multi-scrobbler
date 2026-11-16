import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { Logger } from "@foxxmd/logging";
import { authModeSchema, type AuthConfig, type AuthMode } from "../infrastructure/config/aioConfig.ts";
import { parseBool, parseBoolStrict } from "../../utils.ts";
import { fileExists } from "../../utils/FSUtils.ts";
import { parseDurationFromDurationValue } from "../../../core/TimeUtils.ts";

export const OPEN_HOSTS = ['*'];
/** better-auth default */
export const DEFAULT_SESSION_EXPIRES = 60 * 60 * 24 * 7;
const DEFAULT_SESSION_UPDATE_AGE = 60 * 60 * 24;
export const SECRET_FILE_NAME = 'auth.secret';

export interface AuthSettings {
    mode: AuthMode
    /** ['*'] means any host is accepted (better-auth origin checks are effectively off, MS same-origin check covers it) */
    allowedHosts: string[]
    hostsOpen: boolean
    secureCookies: boolean
    trustProxy: boolean
    secret: string
    /** Origin used as better-auth baseURL fallback when hosts are restricted */
    fallbackOrigin: string
    /**
     * Token for setting the first password without a session. Always exists: generated at startup unless AUTH_SETUP_TOKEN gives a value.
     * Required when setupTokenAlways, or for requests that look risky (public client IP...)
     * */
    setupToken: string
    /** setup token was generated (should be printed in logs) rather than user-defined */
    setupTokenGenerated: boolean
    /** AUTH_SETUP_TOKEN is set: the token is required for every setup request */
    setupTokenAlways: boolean
    /** seconds a session lasts since it was last refreshed */
    sessionExpiresIn: number
    /** seconds after which using a session extends its expiration */
    sessionUpdateAge: number
}

export interface ResolveAuthSettingsOptions {
    config?: AuthConfig
    localUrl: URL
    hasDefinedBaseUrl: boolean
    /** Directory to read/write a generated secret from. If undefined an ephemeral secret is used (tests) */
    dataDir?: string
    logger?: Logger
    env?: NodeJS.ProcessEnv
}

const parseHosts = (val: string): string[] => val.split(',').map(x => x.trim()).filter(x => x !== '');

/**
 * Get the secret used by better-auth to sign cookies/tokens.
 *
 * ENV (BETTER_AUTH_SECRET or AUTH_SECRET) wins, otherwise a random secret is generated once and persisted in the data dir
 * so that sessions survive restarts without the user needing to configure anything.
 * */
export const getOrCreateSecret = (env: NodeJS.ProcessEnv, dataDir?: string, logger?: Logger): string => {
    const envSecret = env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET;
    if (envSecret !== undefined && envSecret.trim() !== '') {
        return envSecret.trim();
    }
    if (dataDir === undefined) {
        return randomBytes(32).toString('base64');
    }
    const secretPath = path.join(dataDir, SECRET_FILE_NAME);
    if (fileExists(secretPath)) {
        const existing = readFileSync(secretPath, 'utf8').trim();
        if (existing !== '') {
            return existing;
        }
    }
    const secret = randomBytes(32).toString('base64');
    writeFileSync(secretPath, secret, {encoding: 'utf8', mode: 0o600});
    logger?.verbose(`Generated new auth secret at ${secretPath}`);
    return secret;
}

export const resolveAuthSettings = (opts: ResolveAuthSettingsOptions): AuthSettings => {
    const {
        config = {},
        localUrl,
        hasDefinedBaseUrl,
        dataDir,
        logger,
        env = process.env,
    } = opts;

    let mode: AuthMode = config.mode ?? 'default';
    if (env.AUTH_MODE !== undefined && env.AUTH_MODE.trim() !== '') {
        const parsed = authModeSchema.safeParse(env.AUTH_MODE.trim().toLowerCase());
        if (!parsed.success) {
            throw new Error(`AUTH_MODE must be one of ${authModeSchema.options.join(', ')} -- given: ${env.AUTH_MODE}`);
        }
        mode = parsed.data;
    }

    let allowedHosts = config.allowedHosts ?? OPEN_HOSTS;
    if (env.ALLOWED_HOSTS !== undefined && env.ALLOWED_HOSTS.trim() !== '') {
        allowedHosts = parseHosts(env.ALLOWED_HOSTS);
    }
    if (allowedHosts.length === 0) {
        allowedHosts = OPEN_HOSTS;
    }
    const hostsOpen = allowedHosts.includes('*');
    if (hostsOpen) {
        allowedHosts = OPEN_HOSTS;
    }

    // better-auth decides cookie Secure once at startup (not per request) and would use NODE_ENV=production (always true in docker)
    // which breaks login over plain http. So default to Secure only when the user told us the UI is served over https.
    let secureCookies = config.secureCookies ?? (hasDefinedBaseUrl && localUrl.protocol === 'https:');
    if (env.SECURE_COOKIES !== undefined && env.SECURE_COOKIES.trim() !== '') {
        secureCookies = parseBoolStrict(env.SECURE_COOKIES);
    }

    const trustProxy = parseBool(env.TRUST_PROXY, config.trustProxy ?? false);

    let setupToken = randomBytes(9).toString('base64url');
    let setupTokenGenerated = true;
    let setupTokenAlways = false;
    const setupEnv = env.AUTH_SETUP_TOKEN?.trim();
    if (setupEnv !== undefined && setupEnv !== '' && !['0', 'false', 'no'].includes(setupEnv.toLowerCase())) {
        setupTokenAlways = true;
        if (!['1', 'true', 'yes'].includes(setupEnv.toLowerCase())) {
            setupToken = setupEnv;
            setupTokenGenerated = false;
        }
    }

    let sessionExpiresIn = DEFAULT_SESSION_EXPIRES;
    const sessionExpiresVal = (env.AUTH_SESSION_EXPIRES !== undefined && env.AUTH_SESSION_EXPIRES.trim() !== '') ? env.AUTH_SESSION_EXPIRES.trim() : config.sessionExpires;
    if (sessionExpiresVal !== undefined) {
        try {
            sessionExpiresIn = Math.floor(parseDurationFromDurationValue(sessionExpiresVal).asSeconds());
        } catch (e) {
            throw new Error(`Session expiration (AUTH_SESSION_EXPIRES or auth.sessionExpires) must be a number of seconds, a duration like '7 days', or an ISO 8601 duration -- given: ${sessionExpiresVal}`, {cause: e});
        }
        if (sessionExpiresIn < 60) {
            throw new Error(`Session expiration (AUTH_SESSION_EXPIRES or auth.sessionExpires) must be at least 60 seconds -- given: ${sessionExpiresVal}`);
        }
    }
    // keep better-auth's 1 day refresh for normal lifetimes but make sure short lifetimes still slide
    const sessionUpdateAge = Math.min(DEFAULT_SESSION_UPDATE_AGE, Math.floor(sessionExpiresIn * 0.2));

    if (hostsOpen && hasDefinedBaseUrl && mode !== 'disabled') {
        logger?.info(`HINT: For better security set ALLOWED_HOSTS=${localUrl.host} (or auth.allowedHosts in config.json) so only requests for your Base URL are accepted`);
    }

    return {
        mode,
        allowedHosts,
        hostsOpen,
        secureCookies,
        trustProxy,
        secret: getOrCreateSecret(env, dataDir, logger),
        fallbackOrigin: localUrl.origin,
        setupToken,
        setupTokenGenerated,
        setupTokenAlways,
        sessionExpiresIn,
        sessionUpdateAge,
    };
}
