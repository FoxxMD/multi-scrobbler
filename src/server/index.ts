import {addAsync, Router} from '@awaitjs/express';
import express, {Request, Response} from 'express';
import bodyParser from 'body-parser';
import {Container, Logger} from '@foxxmd/winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import duration from 'dayjs/plugin/duration.js';
import timezone from 'dayjs/plugin/timezone.js';
import passport from 'passport';
import session from 'express-session';
import {createSession} from 'better-sse';

import {
    capitalize,
    mergeArr, parseBool,
    readJson,
    remoteHostIdentifiers,
    sleep
} from "./utils.js";
import {Server} from "socket.io";
import * as path from "path";
import {projectDir} from "./common/index.js";
import {
    ExpressHandler,
    LogInfo,
    LogLevel
} from "./common/infrastructure/Atomic.js";
import SpotifySource from "./sources/SpotifySource.js";
import {AIOConfig} from "./common/infrastructure/config/aioConfig.js";
import {getRoot} from "./ioc.js";
import {formatLogToHtml, getLogger, isLogLineMinLevel} from "./common/logging.js";
import {MESSAGE} from "triple-beam";
import {setupApi} from "./api/api.js";

const buildDir = path.join(process.cwd() + "/build");


dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);

const app = addAsync(express());
const router = Router();

let envPort = process.env.PORT ?? 9079;

(async function () {

//let io: Server | undefined = undefined;

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
    // if(io !== undefined) {
    //     io.emit('log', formatLogToHtml(log[MESSAGE]));
    // }
});

let logger: Logger;

const f = projectDir;
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

        //io = new Server(server);

        // const logConfig: {level: LogLevel, sort: string, limit: number} = {
        //     level: logger.level as LogLevel || (process.env.LOG_LEVEL || 'info') as LogLevel,
        //     sort: 'descending',
        //     limit: 50,
        // }

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

        //const clientCheckMiddle = makeClientCheckMiddle(scrobbleClients);
        //const sourceCheckMiddle = makeSourceCheckMiddle(scrobbleSources);

        // check ambiguous client/source types like this for now
        const lastfmSources = scrobbleSources.getByType('lastfm');
        const lastfmScrobbles = scrobbleClients.getByType('lastfm');

        const scrobblerNames = lastfmScrobbles.map(x => x.name);
        const nameColl = lastfmSources.filter(x => scrobblerNames.includes(x.name));
        if(nameColl.length > 0) {
            logger.warn(`Last.FM source and clients have same names [${nameColl.map(x => x.name).join(',')}] -- this may cause issues`);
        }

        // app.getAsync('/logs/settings/update', async function (req, res) {
        //     const e = req.query;
        //     for (const [setting, val] of Object.entries(req.query)) {
        //         switch (setting) {
        //             case 'limit':
        //                 logConfig.limit = Number.parseInt(val as string);
        //                 break;
        //             case 'sort':
        //                 logConfig.sort = val as string;
        //                 break;
        //             case 'level':
        //                 logConfig.level = val as LogLevel;
        //                 // for (const [key, logger] of winston.loggers.loggers) {
        //                 //     logger.level = val as string;
        //                 // }
        //                 break;
        //         }
        //     }
        //     let slicedLog = output.filter(x => isLogLineMinLevel(x, logConfig.level)).slice(0, logConfig.limit + 1).map(x => formatLogToHtml(x[MESSAGE]));
        //     if (logConfig.sort === 'ascending') {
        //         slicedLog.reverse();
        //     }
        //     res.send('OK');
        //     io.emit('logClear', slicedLog);
        // });

        // app.useAsync(async function (req, res) {
        //     const remote = req.connection.remoteAddress;
        //     const proxyRemote = req.headers["x-forwarded-for"];
        //     const ua = req.headers["user-agent"];
        //     logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.url}`);
        //     return res.sendStatus(404);
        // });

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
            res.sendFile(path.join(buildDir, "index.html"));
        });

        app.set('views', path.resolve(projectDir, 'src/views'));
        app.set('view engine', 'ejs');
        logger.info(`Server started at ${localUrl}`);

    } catch (e) {
        logger.error('Exited with uncaught error');
        logger.error(e);
    }
}());

