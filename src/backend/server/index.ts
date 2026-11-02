import express from 'express';
import type { Express } from 'express';
import { childLogger, loggerTest, type LogDataPretty, type Logger } from "@foxxmd/logging";
import bodyParser from 'body-parser';
import { stripIndents } from "common-tags";
import session from 'express-session';
import type { Server } from "node:http";
import type { PassThrough } from "node:stream";
import passport from 'passport';
import path from "path";
import qs from 'qs';
import ViteExpress from "vite-express";
import { getRoot } from "../ioc.ts";
import { parseBool } from "../utils.ts";
import { getAddress } from "../utils/NetworkUtils.ts";
import { setupApi } from "./api.ts";
import { clientIpMiddleware, errorHandlerMiddleware, safeModeMiddleware, sameOriginMiddleware, securityHeadersMiddleware, WebFault } from "./middleware.ts";
import { toNodeHandler } from "better-auth/node";
import { authBasePath, createAuth, type MSAuth } from "../common/auth/auth.ts";
import { resolveAuthSettings, type AuthSettings } from "../common/auth/authSettings.ts";
import { getDataDir } from "../common/index.ts";
import { applyOwnerPasswordEnv } from "../common/auth/ownerPassword.ts";
import { AuthStateStore } from "../common/auth/authState.ts";
import { requireAuth, SECURITY_PUBLIC, SECURITY_REQUIRED } from "./requireAuth.ts";
import type { DbConcrete } from "../common/database/drizzle/drizzleUtils.ts";
import type ScrobbleSources from '../sources/ScrobbleSources.ts';
import type ScrobbleClients from '../scrobblers/ScrobbleClients.ts';
import { qsOptions } from '../../core/Atomic.ts';
import { projectRootDir } from "../common/infrastructure/Atomic.ts";
import { createTypedRouter, type ValidationFailureHook } from "@minisylar/express-typed-router";

export interface ServerArgs {
    sources: ScrobbleSources
    clients: ScrobbleClients
}
export interface ServerOptions {
    logger?: Logger
    appLoggerStream?: PassThrough
    initialOutput?: LogDataPretty[]
    testMode?: boolean
    webFault?: WebFault
    /** override resolved auth settings (tests) */
    authSettings?: Partial<AuthSettings>
}

export interface ServerLocals {
    auth: MSAuth
    authSettings: AuthSettings
    authState: AuthStateStore
    db: DbConcrete
}

export const initServer = async (args: ServerArgs, opts: ServerOptions = {}): Promise<[Express, ReturnType<typeof createTypedRouter>, Server?]> => {

    const app = express();

    app.set('query parser', (str: string) => qs.parse(str, qsOptions));

    const {
        sources,
        clients
    } = args;
    const {
        logger: parentLogger = loggerTest,
    } = opts;

    const logger = childLogger(parentLogger, 'API');
    const webFault = opts.webFault ?? new WebFault(logger);


    const onValidationFailure: ValidationFailureHook = (info) => {
        const {req, ...rest} = info;
        logger.warn(rest, 'Request failed validation');
    };
    // Routes that never require auth: ingress Sources (own auth), health/version/metrics.
    // Mounted first so they are matched before anything that requires auth.
    const publicRouter = createTypedRouter().onValidationFailure(onValidationFailure).security(SECURITY_PUBLIC);
    // Everything else under /api. Requires auth via router-level middleware (added below once auth is set up)
    // so any new route is protected by default. Mounted at /api so that middleware never runs for the dashboard/static assets.
    const apiRouter = createTypedRouter().onValidationFailure(onValidationFailure).security(SECURITY_REQUIRED);
    const router = createTypedRouter().onValidationFailure(onValidationFailure);
    router.use(publicRouter);
    router.use('/api', apiRouter);

    try {
        const root = getRoot();
        // pathname the app is mounted under (e.g. '/myapp', or '/' at root)
        // decided at runtime from BASE_URL, not baked in at build time. See
        // vite.config.ts (relative asset base) and src/client/App.tsx (router mode).
        const local = root.get('localUrl');
        const localDefined = root.get('hasDefinedBaseUrl');
        const basePath = localDefined && local.pathname !== '/' ? local.pathname : '/';

        // mount API routes under the same prefix the frontend's relative
        // `api/...` fetches resolve against
        app.use(securityHeadersMiddleware);
        app.use(basePath, safeModeMiddleware(webFault));

        if(!root.get('disableWeb')) {
            const authLogger = childLogger(logger, 'Auth');
            const db = await root.items.db();
            const authSettings: AuthSettings = {
                ...resolveAuthSettings({
                    config: root.get('authConfig'),
                    localUrl: local,
                    hasDefinedBaseUrl: localDefined,
                    // tests use an ephemeral secret
                    dataDir: opts.testMode === true ? undefined : getDataDir(),
                    logger: authLogger
                }),
                ...(opts.authSettings ?? {})
            };
            let authState!: AuthStateStore;
            const auth = createAuth(db, authSettings, {basePath, logger: authLogger, onStateChange: () => authState.refresh()});
            await applyOwnerPasswordEnv(auth, db, authSettings.secret, authLogger);
            authState = await new AuthStateStore(auth, db).refresh();
            const locals: ServerLocals = {auth, authSettings, authState, db};
            Object.assign(app.locals, locals);
            // must be mounted before the router (and its body parsing) so better-auth gets the raw request
            // and so /api/auth/callback/* is not caught by the source auth callback route
            app.all(`${authBasePath(basePath)}/*splat`, clientIpMiddleware({trustProxy: authSettings.trustProxy}), sameOriginMiddleware({trustProxy: authSettings.trustProxy}), toNodeHandler(auth));
            apiRouter.useMiddleware(requireAuth({auth, settings: authSettings, state: authState, logger: authLogger, basePath}));
            if(authSettings.mode !== 'disabled' && !authState.secured) {
                authLogger.warn('Dashboard and API are not secured! Set an admin password from the dashboard or with ADMIN_SETUP_PW.');
                if(authSettings.setupTokenGenerated) {
                    authLogger.warn(`Setup token (required to secure this instance from the dashboard): ${authSettings.setupToken}`);
                }
            }
            authLogger.verbose(`Auth mode: ${authSettings.mode} | Allowed Hosts: ${authSettings.allowedHosts.join(', ')} | Secure Cookies: ${authSettings.secureCookies ? 'Yes' : 'No'} | Trust Proxy: ${authSettings.trustProxy ? 'Yes' : 'No'} | Session Expires: ${authSettings.sessionExpiresIn}s`);
        }

        app.use(basePath, router.getRouter());
        app.use(bodyParser.json());
        app.use(
            bodyParser.urlencoded({
                extended: true,
            })
        );

        //app.use(express.static(buildDir));

        apiRouter.use(session({secret: 'keyboard cat', resave: false, saveUninitialized: false}));
        app.use(session({secret: 'keyboard cat', resave: false, saveUninitialized: false}));
        app.use(passport.initialize());
        app.use(passport.session());

        if(root.get('disableWeb')) {
            logger.warn('API and Dashboard have been DISABLED. Note that any ingress sources (Webscrobbler, Listenbrainz/Lastfm Endpoint Sources, etc...) will be unusable');
            // app is returned but never listens
            return [app, router];
        }

        setupApi({app, router: apiRouter, publicRouter, scrobbleSources: sources, scrobbleClients: clients}, {...opts, logger, webFault});
        app.use(errorHandlerMiddleware(logger));

        if(opts.testMode === true) {
            return [app, router];
        }

        const isProd = root.get('isProd');
        const port = root.get('port');

        const addy = getAddress();
        const addresses: string[] = [];
        let dockerHint = '';
        if (parseBool(process.env.IS_DOCKER) && addy.v4 !== undefined && addy.v4.includes('172')) {
            dockerHint = stripIndents`
            --- HINT ---
            MS is likely being run in a container with BRIDGE networking which means the above addresses are not accessible from outside this container.
            To ensure the container is accessible make sure you have mapped the *container* port ${port} to a *host* port. https://docs.multi-scrobbler.app/installation/?dockerSetting=networking#recommended-settings
            The container will then be accessible at http://HOST_MACHINE_IP:HOST_PORT${localDefined ? ` (or ${local} since you defined this!)` : ''}
            --- HINT ---
            `;
        }
        for (const [k, v] of Object.entries(addy)) {
            if (v !== undefined) {
                switch (k) {
                    case 'host':
                    case 'v4':
                        addresses.push(`---> ${k === 'host' ? 'Local'.padEnd(14, ' ') : 'Network'.padEnd(14, ' ')} http://${v}:${port}`);
                        break;
                    case 'v6':
                        addresses.push(`---> Network (IPv6) http://[${v}]:${port}`);
                }
            }
        }

        app.use(path.resolve(basePath, 'docs'), express.static(path.resolve(projectRootDir, `./docsite/build`)));

        const viteExpressOptions: Parameters<typeof ViteExpress.config>[0] = {
            mode: isProd ? 'production' : 'development',
            inlineViteConfig: {
                base: basePath
            },
            // The build's asset/API references are relative (see vite.config.ts
            // and the client's api/... calls); a relative URL resolves against
            // the *current document path* so a nested
            // client route (e.g. /components/3) would otherwise break them.
            // <base href> pins resolution to the actual mount root for every
            // route depth. window.__MS_RUNTIME__ tells react-router the same
            // mount path so it can set `basename` -- neither can be a
            // build-time constant since the same build serves every
            // deployment (root or subpath).
            transformer: (html) => {
                const baseHref = basePath === '/' ? '/' : `${basePath}/`;
                return html.replace(
                    '<head>',
                    `<head><base href="${baseHref}"><script>window.__MS_RUNTIME__=${JSON.stringify({basePath})};</script>`
                );
            }
        };

        if(!isProd) {
            const conf = await ViteExpress.getViteConfig();
            viteExpressOptions.inlineViteConfig = {
                ...viteExpressOptions.inlineViteConfig,
                ...conf,
                // conf.base is the frontend's relative asset base ('./'), not
                // the Express mount prefix -- keep our runtime-computed one
                base: basePath
            };
        }

        ViteExpress.config(viteExpressOptions);
        const server = await new Promise<Server>((resolve, reject) => {
            const s = ViteExpress.listen(app, port, () => {
                const start = stripIndents`\n
        Server started:
        ${addresses.join('\n')}${dockerHint !== '' ? `\n${dockerHint}` : ''}`

                logger.info(start);

                if(localDefined) {
                    logger.info(`User-defined base URL for UI and redirect URLs (spotify, deezer, lastfm): ${local}`)
                }
                // startup is done, any server-level error from here on happens during nominal operation
                s.off('error', onStartupError);
                s.on('error', (err) => webFault.report(new Error('Server encountered an error', {cause: err})));
                s.on('close', () => {
                    if(!webFault.closing) {
                        webFault.report(new Error('Server closed unexpectedly'));
                    }
                });
                resolve(s);
            });
            const onStartupError = (err: Error) => reject(new Error('Server encountered unrecoverable error', {cause: err}));
            s.once('error', onStartupError);
        });
        return [app, router, server];

    } catch (e) {
        throw new Error('Server crashed with uncaught exception', {cause: e});
    }
}

type ViteConfig = {
    root: string;
    base: string;
    build: {
        outDir: string;
    };
    server?: {
        hmr?: boolean;
    };
};