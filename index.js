import {addAsync, Router} from '@awaitjs/express';
import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';
import winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import {Writable} from 'stream';
import 'winston-daily-rotate-file';
import {
    buildTrackString,
    capitalize,
    labelledFormat,
    longestString,
    readJson, sleep,
    truncateStringToLength
} from "./utils.js";
import Clients from './clients/ScrobbleClients.js';
import ScrobbleSources from "./sources/ScrobbleSources.js";
import {makeClientCheckMiddle, makeSourceCheckMiddle} from "./server/middleware.js";
import TautulliSource from "./sources/TautulliSource.js";
import PlexSource from "./sources/PlexSource.js";

const storage = multer.memoryStorage()
const upload = multer({storage: storage})

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);

const {transports} = winston;

let output = []
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    output.unshift(chunk.toString().replace('\n', ''));
    output = output.slice(0, 101);
    next()
}
const streamTransport = new winston.transports.Stream({
    stream,
})

const logConfig = {
    level: process.env.LOG_LEVEL || 'info',
    sort: 'descending',
    limit: 50,
}

const availableLevels = ['info', 'debug'];
const logPath = process.env.LOG_DIR || `${process.cwd()}/logs`;
const port = process.env.PORT ?? 9078;
const localUrl = `http://localhost:${port}`;

const rotateTransport = new winston.transports.DailyRotateFile({
    dirname: logPath,
    createSymlink: true,
    symlinkName: 'scrobble-current.log',
    filename: 'scrobble-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '5m'
});

const consoleTransport = new transports.Console();

const myTransports = [
    consoleTransport,
    streamTransport,
];

if (typeof logPath === 'string') {
    myTransports.push(rotateTransport);
}

const loggerOptions = {
    level: logConfig.level,
    format: labelledFormat(),
    transports: myTransports,
};

winston.loggers.add('default', loggerOptions);

const logger = winston.loggers.get('default');

const configDir = process.env.CONFIG_DIR || `${process.cwd()}/config`;

const app = addAsync(express());
const router = Router();

app.use(router);
app.use(bodyParser.json());

(async function () {
    try {
        // try to read a configuration file
        let config = {};
        try {
            config = await readJson(`${configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            logger.warn('App config file exists but could not be parsed!');
        }

        // setup defaults for other configs and general config
        const {
            spotify,
            plex,
        } = config || {};

        /*
        * setup clients
        * */
        const scrobbleClients = new Clients();
        await scrobbleClients.buildClientsFromConfig(configDir);
        if (scrobbleClients.clients.length === 0) {
            logger.warn('No scrobble clients were configured!')
        }

        const scrobbleSources = new ScrobbleSources(localUrl, configDir);
        let deprecatedConfigs = [];
        if(spotify !== undefined) {
            logger.warn(`Using 'spotify' top-level property in config.json is deprecated and will be removed in next major version. Please use 'sources' instead.`)
            deprecatedConfigs.push({
                type: 'spotify',
                name: 'unnamed',
                source: 'config.json (top level)',
                mode: 'single',
                data: spotify
            });
        }
        if(plex !== undefined) {
            logger.warn(`Using 'plex' top-level property in config.json is deprecated and will be removed in next major version. Please use 'sources' instead.`)
            deprecatedConfigs.push({
                type: 'plex',
                name: 'unnamed',
                source: 'config.json (top level)',
                mode: 'single',
                data: plex
            });
        }
        await scrobbleSources.buildSourcesFromConfig(deprecatedConfigs);

        const clientCheckMiddle = makeClientCheckMiddle(scrobbleClients);
        const sourceCheckMiddle = makeSourceCheckMiddle(scrobbleSources);

        app.getAsync('/', async function (req, res) {
            let slicedLog = output.slice(0, logConfig.limit + 1);
            if (logConfig.sort === 'ascending') {
                slicedLog.reverse();
            }
            const sourceData = scrobbleSources.sources.map((x) => {
                const {type, tracksDiscovered = 0, name, canPoll = false, polling = false} = x;
                const base = {type, display: capitalize(type), tracksDiscovered, name, canPoll, hasAuth: false};
                if(canPoll) {
                    base.status = polling ? 'Running' : 'Idle';
                } else {
                    base.status = tracksDiscovered > 0 ? 'Received Data' : 'Awaiting Data'
                }
                switch (x.type) {
                    case 'spotify':
                        const authed = x.spotifyApi === undefined || x.spotifyApi.getAccessToken() !== undefined;
                        return {
                            ...base,
                            hasAuth: true,
                            authed,
                            status: authed ? base.status : 'Auth Interaction Required' ,
                        }
                    default:
                        return base;
                }
            })
            res.render('status', {
                sources: sourceData,
                logs: {
                    output: slicedLog,
                    limit: [10, 20, 50, 100].map(x => `<a class="capitalize ${logConfig.limit === x ? 'bold' : ''}" href="logs/settings/update?limit=${x}">${x}</a>`).join(' | '),
                    sort: ['ascending', 'descending'].map(x => `<a class="capitalize ${logConfig.sort === x ? 'bold' : ''}" href="logs/settings/update?sort=${x}">${x}</a>`).join(' | '),
                    level: availableLevels.map(x => `<a class="capitalize ${logConfig.level === x ? 'bold' : ''}" href="logs/settings/update?level=${x}">${x}</a>`).join(' | ')
                }
            });
        })

        app.postAsync('/tautulli', async function (req, res) {
            const payload = TautulliSource.formatPlayObj(req.body, true);
            // try to get config name from payload
            if (req.body.scrobblerConfig !== undefined) {
                const source = scrobbleSources.getByName(req.body.scrobblerConfig);
                if (source !== undefined) {
                    if (source.type !== 'tautulli') {
                        this.logger.warn(`Tautulli event specified a config name but the configured source was not a Tautulli type: ${req.body.scrobblerConfig}`);
                        return res.send('OK');
                    } else {
                        await source.handle(payload, scrobbleClients);
                        return res.send('OK');
                    }
                } else {
                    this.logger.warn(`Tautulli event specified a config name but no configured source found: ${req.body.scrobblerConfig}`);
                    return res.send('OK');
                }
            }
            // if none specified we'll iterate through all tautulli sources and hopefully the user has configured them with filters
            const tSources = scrobbleSources.getByType('tautulli');
            for (const source of tSources) {
                await source.handle(payload, scrobbleClients);
            }

            res.send('OK');
        });

        app.postAsync('/plex', upload.any(), async function (req, res) {
            const {
                body: {
                    payload
                } = {}
            } = req;
            if (payload !== undefined) {
                const playObj = PlexSource.formatPlayObj(JSON.parse(payload), true);

                const pSources = scrobbleSources.getByType('plex');
                for (const source of pSources) {
                    await source.handle(playObj, scrobbleClients);
                }
            }
            res.send('OK');
        });

        app.postAsync('/jellyfin', async function (req, res) {
            const f = 1;
            const {
                body: {
                    payload
                } = {}
            } = req;
            res.send('OK');
        });

        app.use('/auth', sourceCheckMiddle);
        app.getAsync('/auth', async function (req, res) {
            const {
                scrobbleSource: source,
                sourceName: name,
            } = req;

            if (source.type !== 'spotify') {
                return res.status(400).send(`Specified source is not spotify (${source.type})`);
            }

            if (source.spotifyApi === undefined) {
                res.status(400).send('Spotify configuration is not valid');
            } else {
                logger.info('Redirecting to spotify authorization url');
                res.redirect(source.createAuthUrl());
            }
        });

        app.use('/poll', sourceCheckMiddle);
        app.getAsync('/poll', async function (req, res) {
            const {
                scrobbleSource: source,
            } = req;

            if (!source.canPoll) {
                return res.status(400).send(`Specified source cannot poll (${source.type})`);
            }

            source.poll(scrobbleClients);
            res.send('OK');
        });

        app.use('/recent', sourceCheckMiddle);
        app.getAsync('/recent', async function (req, res) {
            const {
                scrobbleSource: source,
            } = req;
            if (!source.canPoll) {
                return res.status(400).send(`Specified source cannot retrieve recent plays (${source.type})`);
            }

            const result = await source.getRecentlyPlayed({formatted: true});
            const artistTruncFunc = truncateStringToLength(Math.min(40, longestString(result.map(x => x.data.artists.join(' / ')).flat())));
            const trackLength = longestString(result.map(x => x.data.track))
            const plays = result.map((x) => {
                const {
                    meta: {
                        url: {
                            web
                        } = {}
                    } = {}
                } = x;
                const buildOpts = {
                    include: ['time', 'timeFromNow', 'track', 'artist'],
                    transformers: {
                        artists: a => artistTruncFunc(a.join(' / ')).padEnd(33),
                        track: t => t.padEnd(trackLength)
                    }
                }
                if (web !== undefined) {
                    buildOpts.transformers.track = t => `<a href="${web}">${t}</a>${''.padEnd(Math.max(trackLength - t.length, 0))}`;
                }
                return buildTrackString(x, buildOpts);
            });
            res.render('recent', {plays, name: source.name, sourceType: source.type});
        });

        app.getAsync('/logs/settings/update', async function (req, res) {
            const e = req.query;
            for (const [setting, val] of Object.entries(req.query)) {
                switch (setting) {
                    case 'limit':
                        logConfig.limit = Number.parseInt(val);
                        break;
                    case 'sort':
                        logConfig.sort = val;
                        break;
                    case 'level':
                        logConfig.level = val;
                        for (const [key, logger] of winston.loggers.loggers) {
                            logger.level = val;
                        }
                        break;
                }
            }
            res.send('OK');
        });

        app.getAsync(/.*callback$/, async function (req, res) {
            logger.info('Received auth code callback from Spotify', {label: 'Spotify'});
            const {
                query: {
                    state
                } = {}
            } = req;
            const source = scrobbleSources.getByName(state);
            const tokenResult = await source.handleAuthCodeCallback(req.query);
            let responseContent = 'OK';
            if (tokenResult === true) {
                source.poll(scrobbleClients);
            } else {
                responseContent = tokenResult;
            }
            return res.send(responseContent);
        });

        let anyNotReady = false;
        for(const source of scrobbleSources.sources.filter(x => x.canPoll === true)) {
            await sleep(1500); // stagger polling by 1.5 seconds so that log messages for each source don't get mixed up
            switch(source.type) {
                case 'spotify':
                    if (source.spotifyApi !== undefined) {
                        if (source.spotifyApi.getAccessToken() === undefined) {
                            anyNotReady = true;
                        } else {
                            source.poll(scrobbleClients);
                        }
                    }
                    break;
                default:
                    if(source.poll !== undefined) {
                        source.poll(scrobbleClients);
                    }
            }
        }
        if (anyNotReady) {
            logger.info(`Some sources are not ready, open ${localUrl} to continue`);
        }

        app.set('views', './views');
        app.set('view engine', 'ejs');
        logger.info(`Server started at ${localUrl}`);
        const server = await app.listen(port)
    } catch (e) {
        logger.error('Exited with uncaught error');
        logger.error(e);
    }
}());

