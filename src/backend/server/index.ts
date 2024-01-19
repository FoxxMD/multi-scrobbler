import {addAsync, Router} from '@awaitjs/express';
import express from 'express';
import ViteExpress from "vite-express";
import bodyParser from 'body-parser';
import passport from 'passport';
import session from 'express-session';
import path from "path";
import { getRoot } from "../ioc.js";
import {Logger} from "@foxxmd/winston";
import { LogInfo } from "../../core/Atomic.js";
import { setupApi } from "./api.js";
import { getAddress, mergeArr, parseBool } from "../utils.js";
import {stripIndents} from "common-tags";
import {ErrorWithCause} from "pony-cause";

//const buildDir = path.join(process.cwd() + "/build");

const app = addAsync(express());
const router = Router();

export const initServer = async (parentLogger: Logger, initialOutput: LogInfo[] = []) => {

    const logger = parentLogger.child({labels: ['API']}, mergeArr);

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

        const isProd = root.get('isProd');
        const port = root.get('port');
        const local = root.get('localUrl');
        const localDefined = root.get('hasDefinedBaseUrl');

        setupApi(app, logger, initialOutput);

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

        if(process.env.USE_HASH_ROUTER === undefined) {
            process.env.USE_HASH_ROUTER = root.get('isSubPath');
        }
        ViteExpress.config({mode: isProd ? 'production' : 'development'});
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
                logger.error(new ErrorWithCause('Server encountered unrecoverable error', {cause: err}));
                process.exit(1);
            });
        } catch (e) {
            throw new ErrorWithCause('Server encountered unrecoverable error', {cause: e});
        }

    } catch (e) {
        logger.error(new ErrorWithCause('Server crashed with uncaught exception', {cause: e}));
    }
}
