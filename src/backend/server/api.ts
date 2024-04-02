import { ExpressWithAsync } from "@awaitjs/express";
import { LogDataPretty, Logger, LogLevel } from "@foxxmd/logging";
import bsseDef from 'better-sse';
import bodyParser from "body-parser";
import { FixedSizeList } from 'fixed-size-list';
import { PassThrough } from "node:stream";
import { Transform } from "stream";
import {
    ClientStatusData,
    DeadLetterScrobble,
    LeveledLogData,
    LogOutputConfig,
    PlayObject,
    SOURCE_SOT,
    SourceStatusData,
} from "../../core/Atomic.js";
import { capitalize } from "../../core/StringUtils.js";
import { ExpressHandler } from "../common/infrastructure/Atomic.js";
import { getRoot } from "../ioc.js";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.js";
import AbstractSource from "../sources/AbstractSource.js";
import MemorySource from "../sources/MemorySource.js";
import { sortByNewestPlayDate } from "../utils.js";
import { setupAuthRoutes } from "./auth.js";
import { setupDeezerRoutes } from "./deezerRoutes.js";
import { setupJellyfinRoutes } from "./jellyfinRoutes.js";
import { makeClientCheckMiddle, makeSourceCheckMiddle } from "./middleware.js";
import { setupPlexRoutes } from "./plexRoutes.js";
import { setupTautulliRoutes } from "./tautulliRoutes.js";
import { setupWebscrobblerRoutes } from "./webscrobblerRoutes.js";
import SpotifySource from "../sources/SpotifySource.js";

const maxBufferSize = 300;
const output: Record<number, FixedSizeList<LogDataPretty>> =  {};

const createAddToLogBuffer = (levelMap:  {[p: number]: string}) => (log: LogDataPretty) => {
    output[log.level].add({...log, levelLabel: levelMap[log.level]});
}

const getLogs = (minLevel: number, limit: number = maxBufferSize, sort: 'asc' | 'desc' = 'desc'): LeveledLogData[] => {
    const allLogs: LeveledLogData[][] = [];
    for(const level of Object.keys(output)) {
        if(Number.parseInt(level) >= minLevel) {
            allLogs.push(output[level].data);
        }
    }
    if(sort === 'desc') {
        return allLogs.flat(1).sort((a, b) => b.time - a.time).slice(0, limit);
    }
    return allLogs.flat(1).sort((a, b) => a.time - b.time).slice(0, limit);
}

export const setupApi = (app: ExpressWithAsync, logger: Logger, appLoggerStream: PassThrough, initialLogOutput: LogDataPretty[] = []) => {
    for(const level of Object.keys(logger.levels.labels)) {
        output[level] = new FixedSizeList<LeveledLogData>(maxBufferSize);
    }

    const addToLogBuffer = createAddToLogBuffer(logger.levels.labels);
    for(const log of initialLogOutput) {
        addToLogBuffer(log);
    }
    const root = getRoot();

    //let logWebLevel: LogLevel = logger.level as LogLevel || (process.env.LOG_LEVEL || 'info') as LogLevel;

    const logConfig: LogOutputConfig = {
        level: logger.level as LogLevel || (process.env.LOG_LEVEL || 'info') as LogLevel,
        sort: 'descending',
        limit: 50,
    }

    let logObjectStream: Transform;
    try {
        logObjectStream = new Transform({
            transform: (chunk, e, cb) => {
                cb(null, chunk)
            },
            objectMode: true,
            allowHalfOpen: true
        })
    } catch (e) {
        console.log(e);
    }

    appLoggerStream.on('data', (log: LogDataPretty) => {
        addToLogBuffer(log);
        if(log.level >= logger.levels.values[logConfig.level]) {
            logObjectStream.write({message: log.line, level: log.level, levelLabel: logger.levels.labels[log.level]});
        }
    });

    const scrobbleSources = root.get('sources');
    const scrobbleClients = root.get('clients');

    const clientMiddleFunc = makeClientCheckMiddle(scrobbleClients);
    const sourceMiddleFunc = makeSourceCheckMiddle(scrobbleSources);

    const clientRequiredMiddle = clientMiddleFunc(true);
    const sourceRequiredMiddle = sourceMiddleFunc(true);

    const setLogWebSettings: ExpressHandler = async (req, res, next) => {
        // @ts-expect-error logLevel not part of session
        const sessionLevel: LogLevel | undefined = req.session.logLevel as LogLevel | undefined;
        if(sessionLevel !== undefined && logConfig.level !== sessionLevel) {
            logConfig.level = sessionLevel;
        }
        // @ts-expect-error limit not part of session
        const sessionLimit: number | undefined = req.session.limit as number | undefined;
        if(sessionLimit !== undefined && logConfig.limit !== sessionLimit) {
            logConfig.limit = sessionLimit;
        }
        next();
    }

    app.get('/api/logs/stream', setLogWebSettings, async (req, res) => {
        const session = await bsseDef.createSession(req, res);
        await session.stream(logObjectStream);
    });

    app.get('/api/logs', setLogWebSettings, async (req, res) => {
        const slicedLog = getLogs(logger.levels.values[logConfig.level], logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        return res.json({data: slicedLog, settings: logConfig});
    });

    app.put('/api/logs', async (req, res) => {
        logConfig.level = req.body.level as LogLevel | undefined ?? logConfig.level;
        logConfig.limit = req.body.limit ?? logConfig.limit;
        const slicedLog = getLogs(logger.levels.values[logConfig.level], logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        // @ts-expect-error logLevel not part of session
        req.session.logLevel = logConfig.level;
        // @ts-expect-error limit not part of session
        req.session.limit = logConfig.limit;
        return res.json({data: slicedLog, settings: logConfig});
    });

    app.get('/api/events', async (req, res) => {
        const session = await bsseDef.createSession(req, res);
        scrobbleSources.emitter.on('*', (payload: any, eventName: string) => {
            if(payload.from !== undefined) {
                session.push({event: eventName, ...payload}, payload.from);
            }
        });
        scrobbleClients.emitter.on('*', (payload: any, eventName: string) => {
            if(payload.from !== undefined) {
                session.push({event: eventName, ...payload}, payload.from);
            }
        });
    });

    setupTautulliRoutes(app, logger, scrobbleSources);
    setupPlexRoutes(app, logger, scrobbleSources);
    setupJellyfinRoutes(app, logger, scrobbleSources);
    setupDeezerRoutes(app, logger, scrobbleSources);
    setupWebscrobblerRoutes(app, logger, scrobbleSources);
    setupAuthRoutes(app, logger, sourceRequiredMiddle, clientRequiredMiddle, scrobbleSources, scrobbleClients);

    app.putAsync('/api/webscrobbler', bodyParser.json({type: ['text/*', 'application/json']}), async (req, res) => {
        logger.info(req.body);
        res.sendStatus(200);
    });

    app.getAsync('/api/webscrobbler', bodyParser.json({type: ['text/*', 'application/json']}), async (req, res) => {
        logger.info(req.body);
        res.sendStatus(200);
    });

    app.getAsync('/api/status', async (req, res, next) => {

        const ss = root.get('sources');

        const sourceData = ss.sources.map((x) => {
            const {
                type,
                tracksDiscovered = 0,
                name,
                canPoll = false,
                polling = false,
                requiresAuth = false,
                requiresAuthInteraction = false,
                authed = false,
            } = x;
            const base: SourceStatusData = {
                status: '',
                type,
                display: capitalize(type),
                tracksDiscovered,
                name,
                canPoll,
                hasAuth: requiresAuth,
                hasAuthInteraction: requiresAuthInteraction,
                authed,
                players: 'players' in x ? (x as MemorySource).playersToObject() : {},
                sot: ('playerSourceOfTruth' in x) ? x.playerSourceOfTruth : SOURCE_SOT.HISTORY,
                supportsUpstreamRecentlyPlayed: x.supportsUpstreamRecentlyPlayed
            };
            if(type === 'spotify') {
                base.authData = {
                    clientId: (x as SpotifySource).config.data.clientId,
                    redirectUri: (x as SpotifySource).usedRedirectUri
                }
            }
            if(!x.isReady()) {
                if(x.buildOK === false) {
                    base.status = 'Initializing Data Failed';
                } else if(x.connectionOK === false) {
                    base.status = 'Communication Failed';
                } else if (requiresAuth && !authed) {
                    base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
                } else {
                    base.status = 'Not Ready';
                }
            } else {
                if (canPoll) {
                    base.status = polling ? 'Polling' : 'Idle';
                } else {
                    base.status = !x.instantiatedAt.isSame(x.lastActivityAt) ? 'Received Data' : 'Awaiting Data';
                }
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
                scrobbling = false,
            } = x;
            const base: ClientStatusData = {
                status: '',
                type,
                display: capitalize(type),
                scrobbled: tracksScrobbled,
                name,
                hasAuth: requiresAuth,
                hasAuthInteraction: requiresAuthInteraction,
                authed,
                initialized,
                deadLetterScrobbles: x.deadLetterScrobbles.length,
                queued: x.queuedScrobbles.length
            };
            if (!initialized) {
                base.status = 'Not Initialized';
            } else if (requiresAuth && !authed) {
                base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
            } else {
                base.status = scrobbling ? 'Running' : 'Idle';
            }
            return base;
        });
        return res.json({sources: sourceData, clients: clientData});
    });

    app.getAsync('/api/recent', sourceMiddleFunc(false), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleSource: source,
            query: {
                upstream = 'false'
            }
        } = req;

        let result: PlayObject[] = [];
        if (source !== undefined) {
            if (upstream === 'true' || upstream === '1') {
                if (!(source as AbstractSource).supportsUpstreamRecentlyPlayed) {
                    return res.status(409).json({message: 'Fetching upstream recently played is not supported for this source'});
                }
                try {
                    result = await (source as AbstractSource).getUpstreamRecentlyPlayed();
                } catch (e) {
                    return res.status(500).json({message: e.message});
                }
            } else {
                result = (source as AbstractSource).getFlatRecentlyDiscoveredPlays();
            }
        }

        return res.json(result);
    });

    app.getAsync('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        const result: DeadLetterScrobble<PlayObject>[] = (client as AbstractScrobbleClient).deadLetterScrobbles;

        return res.json(result);
    });

    app.putAsync('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        (client as AbstractScrobbleClient).logger.debug('User requested processing of all dead letter scrobbles via API');

        await (client as AbstractScrobbleClient).processDeadLetterQueue(1000);

        const result: DeadLetterScrobble<PlayObject>[] = (client as AbstractScrobbleClient).deadLetterScrobbles;

        return res.json(result);
    });

    app.putAsync('/api/dead/:id', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
            params: {
                id
            } = {}
        } = req;

        const deadId = id as string;

        (client as AbstractScrobbleClient).logger.debug(`User requested processing of dead letter scrobble ${deadId} via API call`)

        const deadScrobble = (client as AbstractScrobbleClient).deadLetterScrobbles.find(x => x.id === deadId);

        if(deadScrobble === undefined) {
            (client as AbstractScrobbleClient).logger.debug(`No dead letter scrobble with ID ${deadId}`)
            return res.status(404).send();
        }

        const [scrobbled, dead] = await (client as AbstractScrobbleClient).processDeadLetterScrobble(deadId);

        if(scrobbled) {
            return res.status(200).send();
        }

        return res.json(dead);
    });

    app.deleteAsync('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        (client as AbstractScrobbleClient).logger.debug('User requested deletion of all dead letter scrobbles via API');

        (client as AbstractScrobbleClient).removeDeadLetterScrobbles();

        return res.json([]);
    });

    app.deleteAsync('/api/dead/:id', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
            params: {
                id
            } = {}
        } = req;

        const deadId = id as string;

        (client as AbstractScrobbleClient).logger.debug(`User requested removal of dead letter scrobble ${deadId} via API call`)

        const deadScrobble = (client as AbstractScrobbleClient).deadLetterScrobbles.find(x => x.id === deadId);

        if(deadScrobble === undefined) {
            (client as AbstractScrobbleClient).logger.debug(`No dead letter scrobble with ID ${deadId}`)
            return res.status(404).send();
        }

        (client as AbstractScrobbleClient).removeDeadLetterScrobble(deadId);
        return res.status(200).send();
    });

    app.getAsync('/api/scrobbled', clientMiddleFunc(false), async (req, res, next) => {
        const {
            // @ts-expect-error scrobbleClient not part of req
            scrobbleClient: client,
        } = req;

        let result: PlayObject[] = [];
        if (client !== undefined) {
            result = [...(client as AbstractScrobbleClient).getScrobbledPlays()].sort(sortByNewestPlayDate);
        }

        return res.json(result);
    });

    app.use('/api/poll', sourceRequiredMiddle);
    app.getAsync('/api/poll', async (req, res) => {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const source = req.scrobbleSource as AbstractSource;
        source.logger.debug('User requested (re)start via API call');

        if (!source.canPoll) {
            source.logger.debug(`Does not support polling (${source.type})`);
            return res.status(400).send(`Specified source cannot poll (${source.type})`);
        }

        res.status(200).send('OK');
        if(source.polling) {
            source.logger.info('Source is already polling! Restarting polling...');
            const stopRes = await source.tryStopPolling();
            if(stopRes === true) {
                source.poll();
            }
        } else {
            source.poll();
        }
    });

    app.use('/api/client/init', clientRequiredMiddle);
    app.postAsync('/api/client/init', async (req, res) => {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const client = req.scrobbleClient as AbstractScrobbleClient;
        client.logger.debug('User requested (re)start via API call');

        client.logger.info('Checking (and trying) to stop scrobbler if already running...');
        if(false === (await client.tryStopScrobbling())) {
            return res.status(500).send();
        }

        client.logger.info('Trying to start scrobbler...');
        await client.initScrobbleMonitoring();
        res.status(200).send('OK');
    });

    app.getAsync('/health', async (req, res) => res.redirect(307, `/api/${req.url.slice(1)}`));
    app.getAsync('/api/health', async (req, res) => {
        const {
            type,
            name
        } = req.query;

        const [sourcesReady, sourceMessages] = await scrobbleSources.getStatusSummary(type as string|undefined, name as string|undefined);
        const [clientsReady, clientMessages] = await scrobbleClients.getStatusSummary(type as string|undefined, name as string|undefined);


        return res.status((clientsReady && sourcesReady) ? 200 : 500).json({messages: sourceMessages.concat(clientMessages)});
    });

    app.useAsync('/api/*', async (req, res) => {
        const remote = req.connection.remoteAddress;
        const proxyRemote = req.headers["x-forwarded-for"];
        const ua = req.headers["user-agent"];
        logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.originalUrl}`);
        return res.sendStatus(404);
    });
}
