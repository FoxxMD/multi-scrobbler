import { type LogDataPretty, type Logger, type LogLevel } from "@foxxmd/logging";
import { type Express } from 'express';
import bsseDef from 'better-sse';
import bodyParser from "body-parser";
import { FixedSizeList } from 'fixed-size-list';
import { PassThrough } from "node:stream";
import { Transform } from "stream";
import {
    CLIENT_DEAD_QUEUE,
    type ClientStatusData,
    type DeadLetterScrobble,
    type LeveledLogData,
    type LogOutputConfig,
    PLAY_CLIENT_STATE,
    PLAY_SOURCE_STATE,
    type PlayObject,
    SOURCE_SOT,
    type SOURCE_SOT_TYPES,
    type SourcePlayerJson,
    type SourceStatusData,
} from "../../core/Atomic.js";
import { capitalize } from "../../core/StringUtils.js";
import { type ExpressHandler } from "../common/infrastructure/Atomic.js";
import { getRoot } from "../ioc.js";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.js";
import AbstractSource from "../sources/AbstractSource.js";
import MemorySource from "../sources/MemorySource.js";
import { parseBool } from "../utils.js";
import { sortByNewestPlayDate } from '../../core/PlayUtils.js';
import { setupAuthRoutes } from "./auth.js";
import { setupDeezerRoutes } from "./deezerRoutes.js";
import {setupLZEndpointRoutes} from "./endpointListenbrainzRoutes.js";
import {setupLastfmEndpointRoutes} from "./endpointLastfmRoutes.js";
import { type ClientAwareRequest, type ComponentAwareRequest, makeClientCheckMiddle, makeClientNextMiddle, makeComponentMiddle, makeSourceCheckMiddle, makeSourceNextMiddle, type SourceAwareRequest } from "./middleware.js";
import { setupWebscrobblerRoutes } from "./webscrobblerRoutes.js";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import ScrobbleClients from "../scrobblers/ScrobbleClients.js";
import prom from 'prom-client';
import { SimpleError } from "../common/errors/MSErrors.js";
import { DrizzlePlayRepository, type QueryPlaysOpts, type QueryPlaysOptsJson } from "../common/database/drizzle/repositories/PlayRepository.js";
import { playSelectToDeadScrobble } from "../common/database/drizzle/entityUtils.js";
import AbstractHistoricalScrobbleClient from "../scrobblers/AbstractHistoricalScrobbleClient.js";
import { DrizzlePlayHistoricalRepository } from "../common/database/drizzle/repositories/PlayHistoricalRepository.js";
import { type ComponentClientApi, type ComponentClientApiJson, type ComponentSourceApi, type ComponentSourceApiJson } from "../../core/Api.js";
import { asDayjsHydratedObject } from "../../core/DataUtils.js";
import { Dayjs } from "dayjs";
import { asSerializablePlaySelect } from "../../core/PlayMarshalUtils.js";

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

export const setupApi = (app: Express, logger: Logger, appLoggerStream: PassThrough, initialLogOutput: LogDataPretty[] = [], scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {
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
        level: logger.level as LogLevel || (process.env.LOG_LEVEL || 'trace') as LogLevel,
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

    const clientMiddleFunc = makeClientCheckMiddle(scrobbleClients);
    const sourceMiddleFunc = makeSourceCheckMiddle(scrobbleSources);

    const clientRequiredMiddle = clientMiddleFunc(true);
    const sourceRequiredMiddle = sourceMiddleFunc(true);

    const componentAwareMiddle = makeComponentMiddle(scrobbleSources, scrobbleClients);
    const sourceAwareMiddle = makeSourceNextMiddle(scrobbleSources);
    const clientAwareMiddle = makeClientNextMiddle(scrobbleClients);

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
        const {
            query: {
                next: nextQs
            }
        } = req;

        const isNextapi = nextQs === 'true';

        const session = await bsseDef.createSession(req, res);
        scrobbleSources.emitter.on('*', (payload: any, eventName: string) => {
            if(payload.from !== undefined) {
                if(isNextapi) {
                    session.push({event: eventName, ...payload}, eventName);
                } else {
                    session.push({event: eventName, ...payload}, payload.from);
                }
            }
        });
        scrobbleClients.emitter.on('*', (payload: any, eventName: string) => {
            if(payload.from !== undefined) {
                if(isNextapi) {
                    session.push({event: eventName, ...payload}, eventName);
                } else {
                    session.push({event: eventName, ...payload}, payload.from);
                }
            }
        });
    });

    setupDeezerRoutes(app, logger, scrobbleSources);
    setupWebscrobblerRoutes(app, logger, scrobbleSources);
    setupLZEndpointRoutes(app, logger, scrobbleSources, scrobbleClients);
    setupLastfmEndpointRoutes(app, logger, scrobbleSources);
    setupAuthRoutes(app, logger, sourceRequiredMiddle, clientRequiredMiddle, scrobbleSources, scrobbleClients);

    app.put('/api/webscrobbler', bodyParser.json({type: ['text/*', 'application/json']}), async (req, res) => {
        logger.info(req.body);
        res.sendStatus(200);
    });

    app.get('/api/webscrobbler', bodyParser.json({type: ['text/*', 'application/json']}), async (req, res) => {
        logger.info(req.body);
        res.sendStatus(200);
    });

    app.get('/api/components', async (req, res, next) => {

        const sourceData = scrobbleSources.sources.filter(x => x.databaseOK).map((x) => {
            const {
                canPoll = false,
                polling = false,
                requiresAuth = false,
                requiresAuthInteraction = false,
                authed = false
            } = x;
            const base: ComponentSourceApiJson = x.getApiData();
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

        
        const clientData = scrobbleClients.clients.filter(x => x.databaseOK).map((x) => {
            const {
                requiresAuth = false,
                requiresAuthInteraction = false,
                authed = false,
                scrobbling = false,
            } = x;
            const base: ComponentClientApiJson = x.getApiData();

            if (!x.isReady()) {
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
                base.status = scrobbling ? 'Running' : 'Idle';
            }
            return base;
        });

        return res.json([...sourceData, ...clientData]);
    });

    app.get('/api/sources/:componentVal/players', sourceAwareMiddle, async (req: SourceAwareRequest, res, next) => {
        if(req.component instanceof MemorySource) {
            return res.json(req.component.playersToObject());
        }
        return res.json({});
    });
    app.get('/api/components/:componentVal/players', componentAwareMiddle, async (req: ComponentAwareRequest, res, next) => {
        if(req.component instanceof MemorySource) {
            return res.json(req.component.playersToObject());
        } else if(req.component instanceof AbstractScrobbleClient && req.component.nowPlayingEnabled) {
            return res.json(req.component.getNowPlayingPlayers());
        }
        return res.json({});
    });

    app.get('/api/sources/:componentVal/players/:platformId', sourceAwareMiddle, async (req: SourceAwareRequest, res, next) => {
        if(req.component instanceof MemorySource) {
            const {
                params: {
                    platformId
                }
            } = req;
            const player = req.component.players.get(platformId as string);
            if(player === undefined) {
                return res.status(400).json({error: `No player with platform id ${platformId} exists`});
            }
            return res.json(player);
        }
        return res.json({});
    });
    app.get('/api/components/:componentVal/players/:platformId', componentAwareMiddle, async (req: ComponentAwareRequest, res, next) => {
        const {
            params: {
                platformId
            }
        } = req;
        if(req.component instanceof MemorySource) {

            const player = req.component.players.get(platformId as string);
            if(player === undefined) {
                return res.status(400).json({error: `No player with platform id ${platformId} exists`});
            }
            return res.json(player);
        } else if(req.component instanceof AbstractScrobbleClient && req.component.nowPlayingEnabled) {
            const players = req.component.getNowPlayingPlayers();
            if(players[platformId as string] === undefined) {
                return res.status(400).json({error: `No player with platform id ${platformId} exists`});
            }
            return res.json(players[platformId as string]);
        }
        return res.status(400).json({error: `Component does not support players`});
    });

    app.get('/api/components/:componentVal', componentAwareMiddle, async (req: ComponentAwareRequest, res, next) => {
        const {
            component,
        } = req;
        return res.json(component.getApiData());
    });

    app.get('/api/components/:componentVal/plays', componentAwareMiddle, async (req: ComponentAwareRequest, res, next) => {
        const {
            component,
            query
        } = req;

        const hydratedQuery = asDayjsHydratedObject<QueryPlaysOptsJson, QueryPlaysOpts<Dayjs>>(query);
        const playRes = await component.getPlaysPaginated(hydratedQuery);

        // @ts-expect-error
        playRes.data = playRes.data.map(x => asSerializablePlaySelect(x))
        //PlayApiCommonDetailed
        // plus paginatioon
        return res.json(playRes);
    });

    app.get('/api/components/:componentVal/plays/:playUid', componentAwareMiddle, async (req: ComponentAwareRequest, res, next) => {
        const {
            component,
            query,
            params: {
                playUid
            }
        } = req;

        const playRes = await component.getPlayApiResponse(playUid as string);
        //PlayApiCommonDetailed
        // plus paginatioon
        return res.json(asSerializablePlaySelect(playRes));
    });

    /**
     * 
     * 
     *  new apis above
     * 
     * 
     *  */

    app.get('/api/status', async (req, res, next) => {

        const sourceData = scrobbleSources.sources.map((x) => {
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
                players: 'players' in x ? (x as MemorySource).playersToObject() as unknown as Record<string,SourcePlayerJson> : {},
                sot: ('playerSourceOfTruth' in x) ? x.playerSourceOfTruth as SOURCE_SOT_TYPES : SOURCE_SOT.HISTORY,
                supportsUpstreamRecentlyPlayed: x.supportsUpstreamRecentlyPlayed,
                supportsManualListening: x.supportsManualListening,
                manualListening: x.manualListening,
                systemListeningBehavior: x.getSystemListeningBehavior(),
                ...x.additionalApiData()
            };
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
                initialized: x.isReady(),
                deadLetterScrobbles: x.deadLetterQueued, // x.deadLetterScrobbles.length,
                deadLetterScrobblesTotal: x.deadLetterLength,
                queued: x.queuedLength // x.queuedScrobbles.length
            };
            if (!base.initialized) {
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
                base.status = scrobbling ? 'Running' : 'Idle';
            }
            return base;
        });
        return res.json({sources: sourceData, clients: clientData});
    });

    app.get('/api/recent', sourceMiddleFunc(false), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleSource: source,
            query: {
                upstream = 'false',
                next: queryNext = 'false',
                ...rest
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
                if(queryNext === 'true') {
                    return res.json(await (source as AbstractSource).getRecentPlaysApi(rest));
                }
                result = await (source as AbstractSource).getFlatRecentlyDiscoveredPlays();
                
            }
        }

        return res.json(result);
    });

    app.get('/api/source/art', sourceMiddleFunc(false), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleSource,
            query: {
                data
            }
        } = req;

        const source = scrobbleSource as AbstractSource;
        if(!(source instanceof MemorySource)) {
            return res.status(500).json({message: 'Source does not support players'});
        }

        if('getSourceArt' in source && typeof source.getSourceArt === 'function') {
            const [stream, contentType] = await source.getSourceArt(data);
            res.writeHead(200, {'Content-Type': contentType});
            try {
                return stream.pipe(res);
            } catch (e) {
                logger.error(new Error(`Error occurred while trying to stream art for ${source.name} (${source.type}) | Data ${data}`, {cause: e}));
                return res.status(500).json({message: 'Error during art retrieval'});
            }
        } else {
            return res.status(500).json({message: `Source ${source.name} (${source.type} does not support art retrieval`});
        }
    });

    app.get('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
            query = {}
        } = req;

        const deadQuery: QueryPlaysOpts = {
            ...query as Partial<QueryPlaysOpts>,
            queues: [
                {
                    queueName: CLIENT_DEAD_QUEUE,
                    queueStatus: ['queued','failed']
                }
            ]
        }

        // @ts-ignore
        const result: DeadLetterScrobble<PlayObject>[] = (await (client as AbstractScrobbleClient).getPlaysPaginated(deadQuery)).data.map(x => playSelectToDeadScrobble(x, true));

        return res.json(result);
    });

    app.put('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        (client as AbstractScrobbleClient).logger.verbose('User requested processing of all dead letter scrobbles via API');

        res.status(200).send('OK');

        await ((client as AbstractScrobbleClient).processDeadLetterQueue(1000));
    });

    app.put('/api/dead/:id', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
            params: {
                id
            } = {}
        } = req;

        const deadId = id as string;

        (client as AbstractScrobbleClient).logger.verbose(`User requested processing of dead letter scrobble ${deadId} via API call`)

        try {
            const [scrobbled, dead] = await (client as AbstractScrobbleClient).processDeadLetterScrobble(deadId);
            if(scrobbled) {
                return res.status(200).send();
            }
            return res.json(playSelectToDeadScrobble(dead, true));
        } catch (e) {
            if(e.message.includes(`Play ${deadId} does not exist`)) {
                logger.warn(e);
                return res.status(404).json({error: e});
            }
            logger.error(e);
            return res.status(500).json({error: e});
        }
    });

    app.delete('/api/dead', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
        } = req;

        (client as AbstractScrobbleClient).logger.verbose('User requested deletion of all dead letter scrobbles via API');

        (client as AbstractScrobbleClient).removeDeadLetterScrobbles(['queued', 'failed'], 'failed', false).then(() => null).catch((e) => logger.error(e));

        return res.sendStatus(200);
    });

    app.delete('/api/dead/:id', clientMiddleFunc(true), async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleClient: client,
            params: {
                id
            } = {}
        } = req;

        const deadId = id as string;

        (client as AbstractScrobbleClient).logger.verbose(`User requested removal of dead letter scrobble ${deadId} via API call`)

        try {
            await (client as AbstractScrobbleClient).removeDeadLetterScrobble(deadId,'failed', false);
            return res.status(200).send();
        } catch (e) {
            if(e.message.includes(`Play ${deadId} does not exist`)) {
                logger.warn(e);
                return res.status(404).json({error: e});
            }
            logger.error(e);
            return res.status(500).json({error: e});
        }
    });

    app.get('/api/scrobbled', clientMiddleFunc(false), async (req, res, next) => {
        const {
            // @ts-expect-error scrobbleClient not part of req
            scrobbleClient: client,
            query
        } = req;

        let result: PlayObject[] = [];
        if (client !== undefined) {
            const q: Partial<QueryPlaysOpts> = {
                ...query as Partial<QueryPlaysOpts>,
                state: ['scrobbled']
            }
            result = [...(await (client as AbstractScrobbleClient).getPlaysPaginated(q)).data.map(x => x.play)].sort(sortByNewestPlayDate);
        }

        return res.json(result);
    });

    app.use('/api/source/init', sourceRequiredMiddle);
    app.post('/api/source/init', async (req, res) => {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const source = req.scrobbleSource as AbstractSource;

        const {
            query: {
                force: forceQ = false
            }
        } = req;

        const force = parseBool(forceQ, false);

        source.logger.verbose(`User requested${force ? ' a FORCED' :''} (re)init via API call`);

        res.status(200).send('OK');

        if(source.polling) {
            source.logger.info('Source is already polling! Restarting polling...');
            const stopRes = await source.tryStopPolling(new SimpleError('user initiated', {simple: true, shortStack: true}));
            if(stopRes === true) {
                source.poll({force, notify: false}).catch(e => source.logger.error(e));
            }
        } else {
            source.poll({force, notify: false}).catch(e => source.logger.error(e));
        }
    });

    app.use('/api/source/listen', sourceRequiredMiddle);
    app.post('/api/source/listen', async (req, res) => {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const source = req.scrobbleSource as AbstractSource;

        const {
            query: {
                listening: listeningQ
            }
        } = req;

        if(!source.supportsManualListening)
        {
            source.logger.warn('This source does not support manual Should Scrobble state');
            res.status(400).send();
            return;
        }
        let listening: boolean | undefined;
        if(listeningQ !== undefined) {
            listening = parseBool(listeningQ)
        }
        source.logger.verbose(`User requested Should Scrobble status ${listening === undefined ? 'system' : listening}`);

        source.manualListening = listening;

        res.status(200).json({listening});
    });

    app.use('/api/client/init', clientRequiredMiddle);
    app.post('/api/client/init', async (req, res) => {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const client = req.scrobbleClient as AbstractScrobbleClient;

        const {
            query: {
                force: forceQ = false
            }
        } = req;

        const force = parseBool(forceQ, false);

        client.logger.verbose(`User requested${force ? ' a FORCED' :''} (re)init via API call`);

        client.logger.info('Checking (and trying) to stop scrobbler if already running...');
        if(false === (await client.tryStopScrobbling(new SimpleError('user initiated', {simple: true, shortStack: true})))) {
            return res.status(500).send();
        }

        client.logger.info('Trying to start scrobbler...');
        client.initScrobbleMonitoring({force, notify: false}).catch(e => client.logger.error(e));
        res.status(200).send('OK');
    });

    app.post('/api/client/historical', clientRequiredMiddle, async (req, res) => {
        // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
        const client = req.scrobbleClient as AbstractScrobbleClient;
        if(client instanceof AbstractHistoricalScrobbleClient) {
            client.logger.info('User requested historical play hydration');
            client.hydrateHistoricalScrobbles();
            res.status(200).send('OK');
        } else {
            client.logger.warn('This client does not have historical play capabilities');
            return res.status(400).json({error: 'This client does not have historical play capabilities'});
        }
    });

    app.get('/health', async (req, res) => res.redirect(307, `/api/${req.url.slice(1)}`));
    app.get('/api/health', async (req, res) => {
        const {
            type,
            name
        } = req.query;

        const [sourcesReady, sourceMessages] = await scrobbleSources.getStatusSummary(type as string|undefined, name as string|undefined);
        const [clientsReady, clientMessages] = await scrobbleClients.getStatusSummary(type as string|undefined, name as string|undefined);


        return res.status((clientsReady && sourcesReady) ? 200 : 500).json({messages: sourceMessages.concat(clientMessages)});
    });

    const issuesClientGauge = new prom.Gauge({
                name: 'multiscrobbler_client_issues',
                help: 'Number of errors/issues with Client',
                labelNames: ['name', 'type'],
                async collect() {
                    for(const client of scrobbleClients.clients) {
                        let issues = 0;
                        if(!(await client.isReady())) {
                            issues++;
                        }
                        this.labels({name: client.getSafeExternalName(), type: client.type}).set(issues);
                    }
                }
    });

    const sourceIssues = new prom.Gauge({
                name: 'multiscrobbler_source_issues',
                help: 'Number of errors/issues with Source',
                labelNames: ['name', 'type'],
                async collect() {
                    for(const source of scrobbleSources.sources) {
                        let issues = 0;
                        if(source.requiresAuth && !source.authed) {
                            issues++;
                        }
                        if(source.canPoll && !source.polling) {
                            issues++;
                        }
                        this.labels({name: source.getSafeExternalName(), type: source.type}).set(issues);
                    }
                }
    });


    let playRepo: DrizzlePlayRepository,
    playHistoricalRepo: DrizzlePlayHistoricalRepository;

    const sourcePlays = new prom.Gauge({
                name: 'multiscrobbler_source_plays',
                help: 'Count of stored plays by state for Sources',
                labelNames: ['name', 'type', 'state'],
                async collect() {
                    const res = await playRepo.getPlayCountByState();
                    for(const source of scrobbleSources.sources) {
                        const relevant = res.filter(x => x['componentId'] === source.componentId);
                        for(const s of PLAY_SOURCE_STATE) {
                            const rel = relevant.find(x => x['state'] === s);
                            const count = rel === undefined ? 0 : rel['count(*)'];
                            this.labels({name: source.getSafeExternalName(), type: source.type, state: s}).set(count);
                        }
                    }
                }
    });
    const sourceRetention = new prom.Gauge({
                name: 'multiscrobbler_source_plays_compacted',
                help: 'Count of compacted, stored plays by compaction type for Sources',
                labelNames: ['name', 'type', 'compactionType'],
                async collect() {
                    const res = await playRepo.getCompactedPlayCountByComponent();
                    for(const source of scrobbleSources.sources) {
                        const relevant = res.filter(x => x['componentId'] === source.componentId);
                        for(const s of ['input','transform','input-transform']) {
                            const rel = relevant.find(x => x['compacted'] === s);
                            const count = rel === undefined ? 0 : rel['count(*)'];
                            this.labels({name: source.getSafeExternalName(), type: source.type, compactionType: s}).set(count);
                        }
                    }
                }
    });
    const clientPlays = new prom.Gauge({
                name: 'multiscrobbler_client_plays',
                help: 'Count of stored plays by state for Clients',
                labelNames: ['name', 'type', 'state'],
                async collect() {
                    const res = await playRepo.getPlayCountByState();
                    for(const client of scrobbleClients.clients) {
                        const relevant = res.filter(x => x['componentId'] === client.componentId);
                        for(const s of PLAY_CLIENT_STATE) {
                            const rel = relevant.find(x => x['state'] === s);
                            const count = rel === undefined ? 0 : rel['count(*)'];
                            this.labels({name: client.getSafeExternalName(), type: client.type, state: s}).set(count);
                        }
                    }
                }
    });
    const clientRetention = new prom.Gauge({
                name: 'multiscrobbler_client_plays_compacted',
                help: 'Count of compacted, stored plays by compaction type for Clients',
                labelNames: ['name', 'type', 'compactionType'],
                async collect() {
                    const res = await playRepo.getCompactedPlayCountByComponent();
                    for(const client of scrobbleClients.clients) {
                        const relevant = res.filter(x => x['componentId'] === client.componentId);
                        for(const s of ['input','transform','input-transform']) {
                            const rel = relevant.find(x => x['compacted'] === s);
                            const count = rel === undefined ? 0 : rel['count(*)'];
                            this.labels({name: client.getSafeExternalName(), type: client.type, compactionType: s}).set(count);
                        }
                    }
                }
    });
    const clientHistoricalPlays = new prom.Gauge({
                name: 'multiscrobbler_client_historical_plays',
                help: 'Count of stored historical plays for Clients',
                labelNames: ['name', 'type'],
                async collect() {
                    const res = await playHistoricalRepo.getPlayCountByComponent();
                    for(const client of scrobbleClients.clients) {
                        if(client instanceof AbstractHistoricalScrobbleClient) {
                            const relevant = res.filter(x => x['componentId'] === client.componentId);
                            for(const rel of relevant) {
                                this.labels({name: client.getSafeExternalName(), type: client.type}).set(rel['count(*)']);
                            }
                        }
                    }
                }
    });

    if(process.env.PROMETHEUS_FULL === 'true') {
        prom.collectDefaultMetrics();
    }

    app.get('/api/metrics', async (req, res) => {

        if(playRepo === undefined) {
            const db = await getRoot().items.db();
            playRepo = new DrizzlePlayRepository(db);
            playHistoricalRepo = new DrizzlePlayHistoricalRepository(db);
        }

        const metricsString = await prom.register.metrics();
        return res
        .status(200)
        .set('Content-Type', 'text/plain')
        .send(metricsString);

    });

    app.get('/api/version', async (req, res) => {
       return res.json({version: root.get('version')});
    });

    app.use('/api/*path', async (req, res) => {
        const remote = req.connection.remoteAddress;
        const proxyRemote = req.headers["x-forwarded-for"];
        const ua = req.headers["user-agent"];
        logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.originalUrl}`);
        return res.sendStatus(404);
    });
}
