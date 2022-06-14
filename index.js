import {addAsync, Router} from '@awaitjs/express';
import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';
import winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import duration from 'dayjs/plugin/duration.js';
import passport from 'passport';
import session from 'express-session';
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
import JellyfinSource from "./sources/JellyfinSource.js";
import { Server } from "socket.io";

const storage = multer.memoryStorage()
const upload = multer({storage: storage})

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);

const app = addAsync(express());
const router = Router();

const port = process.env.PORT ?? 9078;
const server = await app.listen(port)
const io = new Server(server);

app.use(router);
app.use(bodyParser.json());

app.use(session({secret: 'keyboard cat', resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());

const {transports} = winston;

let output = []
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    let formatString = chunk.toString().replace('\n', '<br />')
    .replace(/(debug)\s/gi, '<span class="debug text-pink-400">$1 </span>')
    .replace(/(warn)\s/gi, '<span class="warn text-blue-400">$1 </span>')
    .replace(/(info)\s/gi, '<span class="info text-yellow-500">$1 </span>')
    .replace(/(error)\s/gi, '<span class="error text-red-400">$1 </span>')
    output.unshift(formatString);
    output = output.slice(0, 101);
    io.emit('log', formatString);
    next();
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
        const scrobbleClients = new Clients(configDir);
        await scrobbleClients.buildClientsFromConfig();
        if (scrobbleClients.clients.length === 0) {
            logger.warn('No scrobble clients were configured!')
        }

        const scrobbleSources = new ScrobbleSources(localUrl, configDir);
        let deprecatedConfigs = [];
        if (spotify !== undefined) {
            logger.warn(`DEPRECATED: Using 'spotify' top-level property in config.json will be removed in next major version (0.4). Please use 'sources' instead.`)
            deprecatedConfigs.push({
                type: 'spotify',
                name: 'unnamed',
                source: 'config.json (top level)',
                mode: 'single',
                data: spotify
            });
        }
        if (plex !== undefined) {
            logger.warn(`DEPRECATED: Using 'plex' top-level property in config.json will be removed in next major version (0.4). Please use 'sources' instead.`)
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

        // check ambiguous client/source types like this for now
        const lastfmSources = scrobbleSources.getByType('lastfm');
        const lastfmScrobbles = scrobbleClients.getByType('lastfm');

        const scrobblerNames = lastfmScrobbles.map(x => x.name);
        const nameColl = lastfmSources.filter(x => scrobblerNames.includes(x.name));
        if(nameColl.length > 0) {
            logger.warn(`Last.FM source and clients have same names [${nameColl.map(x => x.name).join(',')}] -- this may cause issues`);
        }

        // initialize deezer strategies
        const deezerSources = scrobbleSources.getByType('deezer');
        for(const d of deezerSources) {
            passport.use(`deezer-${d.name}`, d.generatePassportStrategy());
        }

        app.getAsync('/', async function (req, res) {
            let slicedLog = output.slice(0, logConfig.limit + 1);
            if (logConfig.sort === 'ascending') {
                slicedLog.reverse();
            }
            // TODO links for re-trying auth and variables for signalling it (and API recently played)
            const sourceData = scrobbleSources.sources.map((x) => {
                const {
                    type,
                    tracksDiscovered = 0,
                    name,
                    canPoll = false,
                    polling = false,
                    initialized = false,
                    requiresAuth = false,
                    requiresAuthInteraction = false,
                    authed = false,
                } = x;
                const base = {
                    type,
                    display: capitalize(type),
                    tracksDiscovered,
                    name,
                    canPoll,
                    hasAuth: requiresAuth,
                    hasAuthInteraction: requiresAuthInteraction,
                    authed,
                };
                if(!initialized) {
                    base.status = 'Not Initialized';
                } else if(requiresAuth && !authed) {
                    base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
                } else if(canPoll) {
                    base.status = polling ? 'Running' : 'Idle';
                } else {
                    base.status = tracksDiscovered > 0 ? 'Received Data' : 'Awaiting Data'
                }
                return base;
            });
            const clientData = scrobbleClients.clients.map((x) => {
                const {
                    type,
                    tracksScrobbled = 0,
                    name,
                    initialized = false,
                    requiresAuth = false,
                    requiresAuthInteraction = false,
                    authed = false,
                } = x;
                const base = {
                    type,
                    display: capitalize(type),
                    tracksDiscovered: tracksScrobbled,
                    name,
                    hasAuth: requiresAuth,
                };
                if(!initialized) {
                    base.status = 'Not Initialized';
                } else if(requiresAuth && !authed) {
                    base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
                } else {
                    base.status = tracksScrobbled > 0 ? 'Received Data' : 'Awaiting Data';
                }
                return base;
            })
            res.render('status', {
                sources: sourceData,
                clients: clientData,
                logs: {
                    output: slicedLog,
                    limit: [10, 20, 50, 100].map(x => `<a class="capitalize ${logConfig.limit === x ? 'font-bold no-underline pointer-events-none' : ''}" data-limit="${x}" href="logs/settings/update?limit=${x}">${x}</a>`).join(' | '),
                    sort: ['ascending', 'descending'].map(x => `<a class="capitalize ${logConfig.sort === x ? 'font-bold no-underline pointer-events-none' : ''}" data-sort="${x}" href="logs/settings/update?sort=${x}">${x}</a>`).join(' | '),
                    level: availableLevels.map(x => `<a class="capitalize log-${x} ${logConfig.level === x ? `font-bold no-underline pointer-events-none` : ''}" data-log="${x}" href="logs/settings/update?level=${x}">${x}</a>`).join(' | ')
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
            if (req.body !== undefined) {
                const playObj = PlexSource.formatPlayObj(req.body, true);

                const pSources = scrobbleSources.getByType('plex');
                for (const source of pSources) {
                    await source.handle(playObj, scrobbleClients);
                }
            }
            res.send('OK');
        });

        // webhook plugin sends json with context type text/utf-8 so we need to parse it differently
        const jellyfinJsonParser = bodyParser.json({type: 'text/*'});
        app.postAsync('/jellyfin', jellyfinJsonParser, async function (req, res) {
            const playObj = JellyfinSource.formatPlayObj(req.body, true);
            const pSources = scrobbleSources.getByType('jellyfin');
            for (const source of pSources) {
                await source.handle(playObj, scrobbleClients);
            }
            res.send('OK');
        });

        app.use('/client/auth', clientCheckMiddle);
        app.getAsync('/client/auth', async function (req, res) {
            const {
                scrobbleClient,
            } = req;

            switch (scrobbleClient.type) {
                case 'lastfm':
                    res.redirect(scrobbleClient.api.getAuthUrl());
                    break;
                default:
                    return res.status(400).send(`Specified client does not have auth implemented (${scrobbleClient.type})`);
            }
        });

        app.use('/source/auth', sourceCheckMiddle);
        app.getAsync('/source/auth', async function (req, res, next) {
            const {
                scrobbleSource: source,
                sourceName: name,
            } = req;

            switch (source.type) {
                case 'spotify':
                    if (source.spotifyApi === undefined) {
                        res.status(400).send('Spotify configuration is not valid');
                    } else {
                        logger.info('Redirecting to spotify authorization url');
                        res.redirect(source.createAuthUrl());
                    }
                    break;
                case 'lastfm':
                    res.redirect(source.api.getAuthUrl());
                    break;
                case 'deezer':
                    req.session.deezerSource = name;
                    return passport.authenticate(`deezer-${source.name}`)(req,res,next);
                default:
                    return res.status(400).send(`Specified source does not have auth implemented (${source.type})`);
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
            let slicedLog = output.slice(0, logConfig.limit + 1);
            if (logConfig.sort === 'ascending') {
                slicedLog.reverse();
            }
            res.send('OK');
            io.emit('logClear', slicedLog);
        });

        // something about the deezer passport strategy makes express continue with the response even though it should wait for accesstoken callback and userprofile fetching
        // so to get around this add an additional middleware that loops/sleeps until we should have fetched everything ¯\_(ツ)_/¯
        app.getAsync(/.*deezer\/callback*$/, function (req, res, next) {
            const entity = scrobbleSources.getByName(req.session.deezerSource);
            const passportFunc = passport.authenticate(`deezer-${entity.name}`, {session: false});
            return passportFunc(req, res, next);
        }, async function (req, res) {
            let entity = scrobbleSources.getByName(req.session.deezerSource);
            for(let i = 0; i < 3; i++) {
                if(entity.error !== undefined) {
                    return res.send('Error with deezer credentials storage');
                } else if(entity.config.accessToken !== undefined) {
                    // start polling
                    entity.poll(entity.clients)
                    return res.redirect('/');
                } else {
                    await sleep(1500);
                }
            }
            res.send('Waited too long for credentials to store. Try restarting polling.');
        });

        app.getAsync(/.*callback$/, async function (req, res, next) {
            const {
                query: {
                    state
                } = {}
            } = req;
            if (req.url.includes('lastfm')) {
                const {
                    query: {
                        token
                    } = {}
                } = req;
                let entity = scrobbleClients.getByName(state);
                if(entity === undefined) {
                    entity = scrobbleSources.getByName(state);
                }
                try {
                    await entity.api.authenticate(token);
                    await entity.initialize();
                    return res.send('OK');
                } catch (e) {
                    return res.send(e.message);
                }
            } else {
                logger.info('Received auth code callback from Spotify', {label: 'Spotify'});
                const source = scrobbleSources.getByName(state);
                const tokenResult = await source.handleAuthCodeCallback(req.query);
                let responseContent = 'OK';
                if (tokenResult === true) {
                    source.poll(scrobbleClients);
                } else {
                    responseContent = tokenResult;
                }
                return res.send(responseContent);
            }
        });

        let anyNotReady = false;
        for (const source of scrobbleSources.sources.filter(x => x.canPoll === true)) {
            await sleep(1500); // stagger polling by 1.5 seconds so that log messages for each source don't get mixed up
            switch (source.type) {
                case 'spotify':
                    if (source.spotifyApi !== undefined) {
                        if (source.spotifyApi.getAccessToken() === undefined) {
                            anyNotReady = true;
                        } else {
                            source.poll(scrobbleClients);
                        }
                    }
                    break;
                case 'lastfm':
                    if(source.initialized === true) {
                        source.poll(scrobbleClients);
                    }
                    break;
                default:
                    if (source.poll !== undefined) {
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

    } catch (e) {
        logger.error('Exited with uncaught error');
        logger.error(e);
    }
}());

