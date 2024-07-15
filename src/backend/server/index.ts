import { addAsync, Router } from '@awaitjs/express';
import { childLogger, LogDataPretty, Logger } from "@foxxmd/logging";
import bodyParser from 'body-parser';
import { stripIndents } from "common-tags";
import express from 'express';
import session from 'express-session';
import { PassThrough } from "node:stream";
import passport from 'passport';
import path from "path";
import ViteExpress from "vite-express";
import { projectDir } from "../common/index.js";
import { getRoot } from "../ioc.js";
import { getAddress, parseBool } from "../utils.js";
import { setupApi } from "./api.js";

const app = addAsync(express());
const router = Router();

export const initServer = async (parentLogger: Logger, appLoggerStream: PassThrough, initialOutput: LogDataPretty[] = []) => {

    const logger = childLogger(parentLogger, 'API'); // parentLogger.child({labels: ['API']}, mergeArr);

    try {
        app.use(router);
        app.use(bodyParser.json());
        app.use(
            bodyParser.urlencoded({
                extended: true,
            })
        );

        //app.use(express.static(buildDir));

        app.use(session({secret: 'keyboard cat', resave: false, saveUninitialized: false}));
        app.use(passport.initialize());
        app.use(passport.session());

        const root = getRoot();

        if(root.get('disableWeb')) {
            logger.warn('API and Dashboard have been DISABLED. Note that any ingress sources (Plex, Jellyfin, Tautulli, etc...) will be unusable');
            return;
        }

        const isProd = root.get('isProd');
        const port = root.get('port');
        const local = root.get('localUrl');
        const localDefined = root.get('hasDefinedBaseUrl');

        setupApi(app, logger, appLoggerStream, initialOutput);

        const addy = getAddress();
        const addresses: string[] = [];
        let dockerHint = '';
        if (parseBool(process.env.IS_DOCKER) && addy.v4 !== undefined && addy.v4.includes('172')) {
            dockerHint = stripIndents`
            --- HINT ---
            MS is likely being run in a container with BRIDGE networking which means the above addresses are not accessible from outside this container.
            To ensure the container is accessible make sure you have mapped the *container* port ${port} to a *host* port. https://foxxmd.github.io/multi-scrobbler/docs/installation#networking
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

        app.use('/docs', express.static(path.resolve(projectDir, `./docsite/build`)));

        if(process.env.USE_HASH_ROUTER === undefined) {
            process.env.USE_HASH_ROUTER = root.get('isSubPath');
        }

        ViteExpress.config({
            mode: isProd ? 'production' : 'development',
            inlineViteConfig: {
                base: localDefined && local.pathname !== '/' ? local.toString() : '/'
            }
        });
        try {
            ViteExpress.listen(app, port, () => {
                const start = stripIndents`\n
        Server started:
        ${addresses.join('\n')}${dockerHint !== '' ? `\n${dockerHint}` : ''}`

                logger.info(start);

                if(localDefined) {
                    logger.info(`User-defined base URL for UI and redirect URLs (spotify, deezer, lastfm): ${local}`)
                }
            }).on('error', (err) => {
                throw new Error('Server encountered unrecoverable error', {cause: err});
            });
        } catch (e) {
            throw new Error('Server encountered unrecoverable error', {cause: e});
        }

    } catch (e) {
        throw new Error('Server crashed with uncaught exception', {cause: e});
    }
}
