import {addAsync, Router} from '@awaitjs/express';
import express from 'express';
import bodyParser from 'body-parser';
import {Logger} from '@foxxmd/winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import duration from 'dayjs/plugin/duration.js';
import timezone from 'dayjs/plugin/timezone.js';
import passport from 'passport';
import session from 'express-session';
import {
    getAddress,
    parseBool,
    readJson,
    sleep
} from "./utils";
import * as path from "path";
import {projectDir} from "./common/index";
import SpotifySource from "./sources/SpotifySource";
import { AIOConfig } from "./common/infrastructure/config/aioConfig";
import { getRoot } from "./ioc";
import {getLogger} from "./common/logging";
import { setupApi } from "./api/api";
import {LogInfo} from "../core/Atomic";
import {stripIndents} from "common-tags";

const buildDir = path.join(process.cwd() + "/build");


dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);

const app = addAsync(express());
const router = Router();

const isProd = process.env.NODE_ENV !== undefined && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod');

const apiPort = process.env.API_PORT ?? 9079;
const mainPort = process.env.PORT ?? 3000;

let envPort = isProd ? mainPort : apiPort;

(async function () {

app.use(router);
app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);

app.use(express.static(buildDir));

app.use(session({secret: 'keyboard cat', resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());

let output: LogInfo[] = []

const initLogger = getLogger({file: false}, 'init');
initLogger.stream().on('log', (log: LogInfo) => {
    output.unshift(log);
    output = output.slice(0, 301);
});

let logger: Logger;

const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);

    try {
        initLogger.debug(`Config Dir ENV: ${process.env.CONFIG_DIR} -> Resolved: ${configDir}`)
        // try to read a configuration file
        let appConfigFail: Error | undefined = undefined;
        let config = {};
        try {
            config = await readJson(`${configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            appConfigFail = e;
        }

        const {
            webhooks = [],
            port = envPort,
            logging = {},
            debugMode,
        } = (config || {}) as AIOConfig;

        if (process.env.DEBUG_MODE === undefined && debugMode !== undefined) {
            process.env.DEBUG_MODE = debugMode.toString();
        }
        if(process.env.DEBUG_MODE !== undefined) {
            // make sure value is legit
            const b = parseBool(process.env.DEBUG_MODE);
            process.env.DEBUG_MODE = b.toString();
        }

        app.listen(port);
        const root = getRoot(port);

        logger = getLogger(logging, 'app');

        setupApi(app, logger, output);

        if(process.env.IS_LOCAL === 'true') {
            logger.info('multi-scrobbler can be run as a background service! See: https://github.com/FoxxMD/multi-scrobbler/blob/develop/docs/service.md');
        }

        if(appConfigFail !== undefined) {
            logger.warn('App config file exists but could not be parsed!');
            logger.warn(appConfigFail);
        }

        const localUrl = root.get('localUrl');

        const notifiers = root.get('notifiers');
        await notifiers.buildWebhooks(webhooks);

        /*
        * setup clients
        * */
        const scrobbleClients = root.get('clients');
        await scrobbleClients.buildClientsFromConfig(notifiers);
        if (scrobbleClients.clients.length === 0) {
            logger.warn('No scrobble clients were configured!')
        }

        const scrobbleSources = root.get('sources');//new ScrobbleSources(localUrl, configDir);
        await scrobbleSources.buildSourcesFromConfig([]);

        // check ambiguous client/source types like this for now
        const lastfmSources = scrobbleSources.getByType('lastfm');
        const lastfmScrobbles = scrobbleClients.getByType('lastfm');

        const scrobblerNames = lastfmScrobbles.map(x => x.name);
        const nameColl = lastfmSources.filter(x => scrobblerNames.includes(x.name));
        if(nameColl.length > 0) {
            logger.warn(`Last.FM source and clients have same names [${nameColl.map(x => x.name).join(',')}] -- this may cause issues`);
        }

        let anyNotReady = false;
        for (const source of scrobbleSources.sources.filter(x => x.canPoll === true)) {
            await sleep(1500); // stagger polling by 1.5 seconds so that log messages for each source don't get mixed up
            switch (source.type) {
                case 'spotify':
                    if ((source as SpotifySource).spotifyApi !== undefined) {
                        if ((source as SpotifySource).spotifyApi.getAccessToken() === undefined) {
                            anyNotReady = true;
                        } else {
                            (source as SpotifySource).poll();
                        }
                    }
                    break;
                case 'lastfm':
                    if(source.initialized === true) {
                        source.poll();
                    }
                    break;
                default:
                    if (source.poll !== undefined) {
                        source.poll();
                    }
            }
        }
        if (anyNotReady) {
            logger.info(`Some sources are not ready, open ${localUrl} to continue`);
        }

        app.get("/*", function (req, res) {
            if(!isProd) {
                logger.warn(`In development environment this path (on port ${apiPort}) does nothing. You most likely want port ${mainPort}`)
            }
            res.sendFile(path.join(buildDir, "index.html"));
        });

        app.set('views', path.resolve(projectDir, 'src/views'));
        app.set('view engine', 'ejs');


        const addy = getAddress();
        const addresses: string[] = [];
        let dockerHint = '';
        if(parseBool(process.env.IS_DOCKER) && addy.v4 !== undefined && addy.v4.includes('172')) {
            dockerHint = stripIndents`
            --- HINT ---
            MS is likely being run in a container with BRIDGE networking which means the above addresses are not accessible from outside this container.
            To ensure the container is accessible make sure you have mapped the *container* port ${port} to a *host* port. https://foxxmd.github.io/multi-scrobbler/docs/installation#networking
            The container will then be accessible at http://HOST_MACHINE_IP:HOST_PORT
            --- HINT ---
            `;
        }
        for(const [k, v] of Object.entries(addy)) {
            if(v !== undefined) {
                switch(k) {
                    case 'host':
                    case 'v4':
                        addresses.push(`---> ${k === 'host' ? 'Local'.padEnd(14, ' ') : 'Network'.padEnd(14, ' ')} http://${v}:${port}`);
                        break;
                    case 'v6':
                        addresses.push(`---> Network (IPv6) http://[${v}]:${port}`);
                }
            }
        }
        const start = stripIndents`\n
        ${isProd ? 'Server' : 'API Backend'} started:
        ${addresses.join('\n')}${dockerHint !== '' ? `\n${dockerHint}` : ''}`

        logger.info(start);

    } catch (e) {
        logger.error('Exited with uncaught error');
        logger.error(e);
    }
}());

