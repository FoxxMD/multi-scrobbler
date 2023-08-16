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
import {makeClientCheckMiddle, makeSourceCheckMiddle} from "./api/middleware.js";
import TautulliSource from "./sources/TautulliSource.js";
import PlexSource, {plexRequestMiddle} from "./sources/PlexSource.js";
import JellyfinSource from "./sources/JellyfinSource.js";
import {Server} from "socket.io";
import * as path from "path";
import {projectDir} from "./common/index.js";
import LastfmSource from "./sources/LastfmSource.js";
import LastfmScrobbler from "./clients/LastfmScrobbler.js";
import DeezerSource from "./sources/DeezerSource.js";
import AbstractSource from "./sources/AbstractSource.js";
import {
    ExpressHandler,
    LogInfo,
    LogLevel
} from "./common/infrastructure/Atomic.js";
import SpotifySource from "./sources/SpotifySource.js";
import {JellyfinNotifier} from "./sources/ingressNotifiers/JellyfinNotifier.js";
import {PlexNotifier} from "./sources/ingressNotifiers/PlexNotifier.js";
import {TautulliNotifier} from "./sources/ingressNotifiers/TautulliNotifier.js";
import {AIOConfig} from "./common/infrastructure/config/aioConfig.js";
import {getRoot} from "./ioc.js";
import {formatLogToHtml, getLogger, isLogLineMinLevel} from "./common/logging.js";
import {MESSAGE} from "triple-beam";
import {setupApi} from "./api/api.js";
import {Transform} from "stream";
import {PlayObject, TrackStringOptions} from "../core/Atomic.js";
import {buildTrackString, longestString, truncateStringToLength} from "../core/StringUtils.js";

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

let io: Server | undefined = undefined;

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
    if(io !== undefined) {
        io.emit('log', formatLogToHtml(log[MESSAGE]));
    }
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

        const server = await app.listen(port);

        io = new Server(server);

        const logConfig: {level: LogLevel, sort: string, limit: number} = {
            level: logging.level || (process.env.LOG_LEVEL || 'info') as LogLevel,
            sort: 'descending',
            limit: 50,
        }


        let logObjectStream: Transform;
        try {
            logObjectStream = new Transform({
                transform(chunk, e, cb) {
                    cb(null, chunk)
                },
                objectMode: true,
                allowHalfOpen: true
            })
        } catch (e) {
            console.log(e);
        }

        logger = getLogger(logging, 'app');
        logger.stream().on('log', (log: LogInfo) => {
            output.unshift(log);
            output = output.slice(0, 301);
            if(isLogLineMinLevel(log, logConfig.level)) {
                //sse.send(log, 'logee');
                logObjectStream.write({message: log[MESSAGE], level: log.level});
                io.emit('log', formatLogToHtml(log[MESSAGE]));
            }
        });


        app.get('/logs/stream', async (req, res) => {
            const session = await createSession(req, res);
            await session.stream(logObjectStream);
        });

        if(process.env.IS_LOCAL === 'true') {
            logger.info('multi-scrobbler can be run as a background service! See: https://github.com/FoxxMD/multi-scrobbler/blob/develop/docs/service.md');
        }

        if(appConfigFail !== undefined) {
            logger.warn('App config file exists but could not be parsed!');
            logger.warn(appConfigFail);
        }
        const root = getRoot(port);
        const localUrl = root.get('localUrl');

        const notifiers = root.get('notifiers');
        await notifiers.buildWebhooks(webhooks);

        const availableLevels = ['error', 'warn', 'info', 'verbose', 'debug'];


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
        const deezerSources = scrobbleSources.getByType('deezer') as DeezerSource[];
        for(const d of deezerSources) {
            passport.use(`deezer-${d.name}`, d.generatePassportStrategy());
        }

        setupApi(app);

        app.getAsync('/dashboard', async function (req, res) {
            let slicedLog = output.filter(x => isLogLineMinLevel(x, logConfig.level)).slice(0, logConfig.limit + 1).map(x => formatLogToHtml(x[MESSAGE]));
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
                    status: '',
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
                    status: '',
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
                    level: availableLevels.map(x => `<a class="capitalize log-level log-${x} ${logConfig.level === x ? `font-bold no-underline pointer-events-none` : ''}" data-log="${x}" href="logs/settings/update?level=${x}">${x}</a>`).join(' | ')
                }
            });
        })

        const tauIngress = new TautulliNotifier();
        const tautulliIngressRoute: ExpressHandler = async function(this: any, req, res) {
            tauIngress.trackIngress(req, false);

            const payload = TautulliSource.formatPlayObj(req, {newFromSource: true});
            // try to get config name from payload
            if (req.body.scrobblerConfig !== undefined) {
                const source = scrobbleSources.getByName(req.body.scrobblerConfig);
                if (source !== undefined) {
                    if (source.type !== 'tautulli') {
                        this.logger.warn(`Tautulli event specified a config name but the configured source was not a Tautulli type: ${req.body.scrobblerConfig}`);
                        return res.send('OK');
                    } else {
                        if((source.config.options?.logPayload ?? parseBool(process.env.DEBUG_MODE)) === true) {
                            source.logger.debug(`Received Payload`, req.body);
                        }
                        // @ts-expect-error TS(2339): Property 'handle' does not exist on type 'never'.
                        await source.handle(payload);
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
                // @ts-expect-error TS(2339): Property 'handle' does not exist on type 'never'.
                await source.handle(payload);
            }

            res.send('OK');
        };

        app.postAsync('/tautulli', async function(req, res)  {
            res.redirect(307, 'api/plex/tautulli');
        });
        app.postAsync('/api/tautulli/ingress', tautulliIngressRoute);

        const plexMiddle = plexRequestMiddle();
        const plexLog = logger.child({labels: ['Plex Request']}, mergeArr);
        const plexIngress = new PlexNotifier();
        const plexIngressMiddle: ExpressHandler = async function (req, res, next) {
                // track request before parsing body to ensure we at least log that something is happening
                // (in the event body parsing does not work or request is not POST/PATCH)
                plexIngress.trackIngress(req, true);
                next();
            };
        const plexIngressRoute: ExpressHandler = async function (req, res) {
            plexIngress.trackIngress(req, false);

            const { payload } = req as any;
            if(payload !== undefined) {
                const playObj = PlexSource.formatPlayObj(payload, {newFromSource: true});

                const pSources = scrobbleSources.getByType('plex') as PlexSource[];
                if(pSources.length === 0) {
                    plexLog.warn('Received valid Plex webhook payload but no Plex sources are configured');
                }

                for (const source of pSources) {
                    await source.handle(playObj);
                }
            }

            res.send('OK');
        };
        app.postAsync('/plex', async function(req, res)  {
            res.redirect(307, 'api/plex/ingress');
        });
        app.postAsync('/api/plex/ingress', plexIngressMiddle, plexMiddle, plexIngressRoute);


        // webhook plugin sends json with context type text/utf-8 so we need to parse it differently
        const jellyfinJsonParser = bodyParser.json({type: 'text/*'});
        const jellyIngress = new JellyfinNotifier();
        app.postAsync('/jellyfin', async function(req, res)  {
           res.redirect(307, 'api/jellyfin/ingress');
        });
        app.postAsync('/api/jellyfin/ingress',
            async function (req, res, next) {
                // track request before parsing body to ensure we at least log that something is happening
                // (in the event body parsing does not work or request is not POST/PATCH)
                jellyIngress.trackIngress(req, true);
                next();
            },
            jellyfinJsonParser, async function (req, res) {
            jellyIngress.trackIngress(req, false);

            res.send('OK');

            const parts = remoteHostIdentifiers(req);
            const connectionId = `${parts.host}-${parts.proxy ?? ''}`;

            const playObj = JellyfinSource.formatPlayObj({...req.body, connectionId}, {newFromSource: true});
            const pSources = scrobbleSources.getByType('jellyfin') as JellyfinSource[];
            if(pSources.length === 0) {
                logger.warn('Received Jellyfin connection but no Jellyfin sources are configured');
            }
                const logPayload = pSources.some(x => {
                    const {
                        data: {
                        } = {},
                        options: {
                            logPayload = parseBool(process.env.DEBUG_MODE)
                        } = {}
                    } = x.config;
                    return logPayload;
                });
            if(logPayload) {
                logger.debug(`[Jellyfin] Logging payload due to at least one Jellyfin source having 'logPayload: true`, req.body);
            }
            for (const source of pSources) {
                await source.handle(playObj);
            }
        });

        app.use('/api/client/auth', clientCheckMiddle);
        app.getAsync('/api/client/auth', async function (req, res) {
            const {
                scrobbleClient,
            } = req as any;

            switch (scrobbleClient.type) {
                case 'lastfm':
                    res.redirect(scrobbleClient.api.getAuthUrl());
                    break;
                default:
                    return res.status(400).send(`Specified client does not have auth implemented (${scrobbleClient.type})`);
            }
        });

        app.use('/api/source/auth', sourceCheckMiddle);
        app.getAsync('/api/source/auth', async function (req, res, next) {
            const {
                // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
                scrobbleSource: source,
                // @ts-expect-error TS(2339): Property 'sourceName' does not exist on type 'Requ... Remove this comment to see the full error message
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
                    // @ts-expect-error TS(2339): Property 'deezerSource' does not exist on type 'Se... Remove this comment to see the full error message
                    req.session.deezerSource = name;
                    return passport.authenticate(`deezer-${source.name}`)(req,res,next);
                default:
                    return res.status(400).send(`Specified source does not have auth implemented (${source.type})`);
            }
        });

        app.use('/api/poll', sourceCheckMiddle);
        app.getAsync('/api/poll', async function (req, res) {
            const {
                // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
                scrobbleSource: source,
            } = req;

            if (!source.canPoll) {
                return res.status(400).send(`Specified source cannot poll (${source.type})`);
            }

            source.poll();
            res.send('OK');
        });

        app.use('/api/recent', sourceCheckMiddle);
        app.getAsync('/api/recent', async function (req, res) {
            const {
                // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
                scrobbleSource: source,
            } = req;
            if (!source.canPoll) {
                return res.status(400).send(`Specified source cannot retrieve recent plays (${source.type})`);
            }

            const result = (source as AbstractSource).getFlatRecentlyDiscoveredPlays();
            const artistTruncFunc = truncateStringToLength(Math.min(40, longestString(result.map((x: any) => x.data.artists.join(' / ')).flat())));
            const trackLength = longestString(result.map((x: any) => x.data.track))
            const plays = result.map((x: PlayObject) => {
                const {
                    meta: {
                        url: {
                            web
                        } = {}
                    } = {}
                } = x;
                const buildOpts: TrackStringOptions = {
                    include: ['time', 'timeFromNow', 'track', 'artist'],
                    transformers: {
                        artists: (a: any) => artistTruncFunc(a.join(' / ')).padEnd(33),
                        track: (t: any) => t.padEnd(trackLength)
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
                        logConfig.limit = Number.parseInt(val as string);
                        break;
                    case 'sort':
                        logConfig.sort = val as string;
                        break;
                    case 'level':
                        logConfig.level = val as LogLevel;
                        // for (const [key, logger] of winston.loggers.loggers) {
                        //     logger.level = val as string;
                        // }
                        break;
                }
            }
            let slicedLog = output.filter(x => isLogLineMinLevel(x, logConfig.level)).slice(0, logConfig.limit + 1).map(x => formatLogToHtml(x[MESSAGE]));
            if (logConfig.sort === 'ascending') {
                slicedLog.reverse();
            }
            res.send('OK');
            io.emit('logClear', slicedLog);
        });

        // something about the deezer passport strategy makes express continue with the response even though it should wait for accesstoken callback and userprofile fetching
        // so to get around this add an additional middleware that loops/sleeps until we should have fetched everything ¯\_(ツ)_/¯
        app.getAsync(/.*deezer\/callback*$/, function (req, res, next) {
            if(req.url.indexOf('/api') !== 0) {
                return res.redirect(307, `/api${req.url}`);
            }
            // @ts-expect-error TS(2339): Property 'deezerSource' does not exist on type 'Se... Remove this comment to see the full error message
            const entity = scrobbleSources.getByName(req.session.deezerSource as string);
            const passportFunc = passport.authenticate(`deezer-${entity.name}`, {session: false});
            return passportFunc(req, res, next);
        }, async function (req, res) {
            // @ts-expect-error TS(2339): Property 'deezerSource' does not exist on type 'Se... Remove this comment to see the full error message
            let entity = scrobbleSources.getByName(req.session.deezerSource as string) as DeezerSource;
            for(let i = 0; i < 3; i++) {
                if(entity.error !== undefined) {
                    return res.send('Error with deezer credentials storage');
                } else if(entity.config.data.accessToken !== undefined) {
                    // start polling
                    entity.poll()
                    return res.redirect('/');
                } else {
                    await sleep(1500);
                }
            }
            res.send('Waited too long for credentials to store. Try restarting polling.');
        });

        app.getAsync(/.*callback$/, async function (req, res, next) {
            if(req.url.indexOf('/api') !== 0) {
                return res.redirect(307, `/api${req.url}`);
            }
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
                let entity: LastfmScrobbler | LastfmSource | undefined = scrobbleClients.getByName(state) as (LastfmScrobbler | undefined);
                if(entity === undefined) {
                    entity = scrobbleSources.getByName(state) as LastfmSource;
                }
                try {
                    await entity.api.authenticate(token);
                    await entity.initialize();
                    return res.send('OK');
                } catch (e) {
                    return res.send(e.message);
                }
            } else {
                // TODO right now all sources requiring source interaction are covered by logic branches (deezer above and spotify here)
                // but eventually should update all source callbacks to url specific URLS to avoid ambiguity...
                // wish we could use state param to identify name/source but not all auth strategies and auth provides may provide access to that
                logger.info('Received auth code callback from Spotify', {label: 'Spotify'});
                const source = scrobbleSources.getByNameAndType(state as string, 'spotify') as SpotifySource;
                const tokenResult = await source.handleAuthCodeCallback(req.query);
                let responseContent = 'OK';
                if (tokenResult === true) {
                    await source.testAuth();
                    source.poll();
                } else {
                    responseContent = tokenResult;
                }
                return res.send(responseContent);
            }
        });


        app.getAsync('/health', async function(req, res)  {
            return res.redirect(307, `/api/${req.url.slice(1)}`);
        });
        app.getAsync('/api/health', async function (req, res) {
            const {
                type,
                name
            } = req.query;

            const [sourcesReady, sourceMessages] = await scrobbleSources.getStatusSummary(type as string|undefined, name as string|undefined);
            const [clientsReady, clientMessages] = await scrobbleClients.getStatusSummary(type as string|undefined, name as string|undefined);


            return res.status((clientsReady && sourcesReady) ? 200 : 500).json({messages: sourceMessages.concat(clientMessages)});
        });

        app.useAsync(async function (req, res) {
            const remote = req.connection.remoteAddress;
            const proxyRemote = req.headers["x-forwarded-for"];
            const ua = req.headers["user-agent"];
            logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.url}`);
            return res.sendStatus(404);
        });

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

