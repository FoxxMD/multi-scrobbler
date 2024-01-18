import {ExpressWithAsync} from "@awaitjs/express";
import {getRoot} from "../ioc";
import {makeClientCheckMiddle, makeSourceCheckMiddle} from "./middleware";
import AbstractSource from "../sources/AbstractSource";
import {
    ClientStatusData, DeadLetterScrobble,
    LogInfo,
    LogInfoJson,
    LogLevel,
    LogOutputConfig, PlayObject,
    SourceStatusData,
} from "../../core/Atomic";
import {Logger} from "@foxxmd/winston";
import {formatLogToHtml, getLogger, isLogLevelMinLevel, isLogLineMinLevel} from "../common/logging";
import {MESSAGE} from "triple-beam";
import {Transform} from "stream";
//import {createSession} from "better-sse";
import * as bsse from 'better-sse';
import {setupTautulliRoutes} from "./tautulliRoutes";
import {setupPlexRoutes} from "./plexRoutes";
import {setupJellyfinRoutes} from "./jellyfinRoutes";
import {setupDeezerRoutes} from "./deezerRoutes";
import {setupAuthRoutes} from "./auth";
import {ExpressHandler, ScrobbledPlayObject} from "../common/infrastructure/Atomic";
import MemorySource from "../sources/MemorySource";
import {capitalize} from "../../core/StringUtils";
import {source} from "common-tags";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient";
import {sortByNewestPlayDate} from "../utils";
import bodyParser from "body-parser";
import {setupWebscrobblerRoutes} from "./webscrobblerRoutes";
import {FixedSizeList} from 'fixed-size-list';

const maxBufferSize = 300;
const output: {
    [key in LogLevel]: FixedSizeList<LogInfo>
} = {
    'debug': new FixedSizeList<LogInfo>(maxBufferSize),
    'verbose': new FixedSizeList<LogInfo>(maxBufferSize),
    'info': new FixedSizeList<LogInfo>(maxBufferSize),
    'warn': new FixedSizeList<LogInfo>(maxBufferSize),
    'error': new FixedSizeList<LogInfo>(maxBufferSize),
}

const addToLogBuffer = (log: LogInfo) => {
    output[log.level as LogLevel].add(log);
}

const getLogs = (minLevel: LogLevel, limit: number = maxBufferSize, sort: 'asc' | 'desc' = 'desc'): LogInfo[] => {
    const allLogs: LogInfo[][] = [];
    for(const level of Object.keys(output)) {
        if(isLogLevelMinLevel(level as LogLevel, minLevel)) {
            allLogs.push(output[level].data);
        }
    }
    if(sort === 'desc') {
        return allLogs.flat(1).sort((a, b) => b.id - a.id).slice(0, limit);
    }
    return allLogs.flat(1).sort((a, b) => a.id - b.id).slice(0, limit);
}

const availableLevels: LogLevel[] = ['error', 'warn', 'info', 'verbose', 'debug'];

export const setupApi = (app: ExpressWithAsync, logger: Logger, initialLogOutput: LogInfo[] = []) => {
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
            transform(chunk, e, cb) {
                cb(null, chunk)
            },
            objectMode: true,
            allowHalfOpen: true
        })
    } catch (e) {
        console.log(e);
    }

    const appLogger = getLogger({}, 'app');
    appLogger.stream().on('log', (log: LogInfo) => {
        addToLogBuffer(log);
        if(isLogLineMinLevel(log, logConfig.level)) {
            logObjectStream.write({message: log[MESSAGE], level: log.level});
        }
    });

    const scrobbleSources = root.get('sources');
    const scrobbleClients = root.get('clients');

    const clientMiddleFunc = makeClientCheckMiddle(scrobbleClients);
    const sourceMiddleFunc = makeSourceCheckMiddle(scrobbleSources);

    const clientRequiredMiddle = clientMiddleFunc(true);
    const sourceRequiredMiddle = sourceMiddleFunc(true);

    const setLogWebSettings: ExpressHandler = async (req, res, next) => {
        // @ts-ignore
        const sessionLevel: LogLevel | undefined = req.session.logLevel as LogLevel | undefined;
        if(sessionLevel !== undefined && logConfig.level !== sessionLevel) {
            logConfig.level = sessionLevel;
        }
        // @ts-ignore
        const sessionLimit: number | undefined = req.session.limit as Number | undefined;
        if(sessionLimit !== undefined && logConfig.limit !== sessionLimit) {
            logConfig.limit = sessionLimit;
        }
        next();
    }

    app.get('/api/logs/stream', setLogWebSettings, async (req, res) => {
        const session = await bsse.createSession(req, res);
        await session.stream(logObjectStream);
    });

    app.get('/api/logs', setLogWebSettings, async (req, res) => {
        const slicedLog = getLogs(logConfig.level, logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        const jsonLogs: LogInfoJson[] = slicedLog.map(x => ({...x, formattedMessage: x[MESSAGE]}));
        return res.json({data: jsonLogs, settings: logConfig});
    });

    app.put('/api/logs', async (req, res) => {
        logConfig.level = req.body.level as LogLevel | undefined ?? logConfig.level;
        logConfig.limit = req.body.limit ?? logConfig.limit;
        const slicedLog = getLogs(logConfig.level, logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        // @ts-ignore
        req.session.logLevel = logConfig.level;
        // @ts-ignore
        req.session.limit = logConfig.limit;
        const jsonLogs: LogInfoJson[] = slicedLog.map(x => ({...x, formattedMessage: x[MESSAGE]}));
        return res.json({data: jsonLogs, settings: logConfig});
    });

    app.get('/api/events', async (req, res) => {
        const session = await bsse.createSession(req, res);
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
                initialized = false,
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
                players: 'players' in x ? (x as MemorySource).playersToObject() : {}
            };
            if (!initialized) {
                base.status = 'Not Initialized';
            } else if (requiresAuth && !authed) {
                base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
            } else if (canPoll) {
                base.status = polling ? 'Polling' : 'Idle';
            } else {
                base.status = !x.instantiatedAt.isSame(x.lastActivityAt) ? 'Received Data' : 'Awaiting Data';
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
        } = req;

        let result: PlayObject[] = [];
        if (source !== undefined) {
            result = (source as AbstractSource).getFlatRecentlyDiscoveredPlays();
        }

        return res.json(result);
    });

    app.getAsync('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        let result: DeadLetterScrobble<PlayObject>[] = (client as AbstractScrobbleClient).deadLetterScrobbles;

        return res.json(result);
    });

    app.putAsync('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        await (client as AbstractScrobbleClient).processDeadLetterQueue(1000);

        let result: DeadLetterScrobble<PlayObject>[] = (client as AbstractScrobbleClient).deadLetterScrobbles;

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

        const deadScrobble = (client as AbstractScrobbleClient).deadLetterScrobbles.find(x => x.id === deadId);

        if(deadScrobble === undefined) {
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

        const deadScrobble = (client as AbstractScrobbleClient).deadLetterScrobbles.find(x => x.id === deadId);

        if(deadScrobble === undefined) {
            return res.status(404).send();
        }

        (client as AbstractScrobbleClient).removeDeadLetterScrobble(deadId);
        return res.status(200).send();
    });

    app.getAsync('/api/scrobbled', clientMiddleFunc(false), async (req, res, next) => {
        const {
            // @ts-ignore
            scrobbleClient: client,
        } = req;

        let result: PlayObject[] = [];
        if (client !== undefined) {
            result = [...(client as AbstractScrobbleClient).getScrobbledPlays()].sort(sortByNewestPlayDate);
        }

        return res.json(result);
    });

    app.use('/api/poll', sourceRequiredMiddle);
    app.getAsync('/api/poll', async function (req, res) {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const source = req.scrobbleSource as AbstractSource;

        if (!source.canPoll) {
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
    app.postAsync('/api/client/init', async function (req, res) {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const client = req.scrobbleClient as AbstractScrobbleClient;

        logger.info('Checking (and trying) to stop scrobbler if already running...');
        if(false === (await client.tryStopScrobbling())) {
            return res.status(500).send();
        }

        logger.info('Trying to start scrobbler...');
        await client.initScrobbleMonitoring();
        res.status(200).send('OK');
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

    app.useAsync('/api/*', async function (req, res) {
        const remote = req.connection.remoteAddress;
        const proxyRemote = req.headers["x-forwarded-for"];
        const ua = req.headers["user-agent"];
        logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.url}`);
        return res.sendStatus(404);
    });
}
