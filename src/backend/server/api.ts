import {loggerTest, type LogDataPretty, type Logger, type LogLevel} from "@foxxmd/logging";
import type {Express} from 'express';
import bsseDef from 'better-sse';
import bodyParser from "body-parser";
import { FixedSizeList } from 'fixed-size-list';
import { PassThrough } from "node:stream";
import { Transform } from "stream";
import {
    type LogOutputConfig,
    queueContextSchema,
    logLevelStandaloneSchema,
} from "../../core/Atomic.ts";
import type {LeveledLogData} from "../common/infrastructure/Atomic.ts";
import { getRoot } from "../ioc.ts";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.ts";
import AbstractSource from "../sources/AbstractSource.ts";
import MemorySource from "../sources/MemorySource.ts";
import { setupAuthRoutes } from "./auth.ts";
import { setupDeezerRoutes } from "./deezerRoutes.ts";
import {setupLZEndpointRoutes} from "./endpointListenbrainzRoutes.ts";
import {setupLastfmEndpointRoutes} from "./endpointLastfmRoutes.ts";
import { makeComponentMiddle } from "./middleware.ts";
import { setupWebscrobblerRoutes } from "./webscrobblerRoutes.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import prom from 'prom-client';
import { findAuthIssue, SimpleError } from "../common/errors/MSErrors.ts";
import { DrizzlePlayRepository, type QueryPlaysOpts, type QueryPlaysOptsJson } from "../common/database/drizzle/repositories/PlayRepository.ts";
import AbstractHistoricalScrobbleClient from "../scrobblers/AbstractHistoricalScrobbleClient.ts";
import { DrizzlePlayHistoricalRepository } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import {componentStateBodySchema, type ComponentClientApiJson, type ComponentSourceApiJson} from "../../core/Api.ts";
import { asDayjsHydratedObject } from "../../core/DataUtils.ts";
import type {Dayjs} from "dayjs";
import { asSerializablePlaySelect } from "../../core/PlayMarshalUtils.ts";
import { serializeError } from "serialize-error";
import { z } from 'zod';
import type { createTypedRouter, TypedMiddleware } from "@minisylar/express-typed-router";
import { hasMetricRepositories, registerMetrics, setMetricRepositories } from "./promMetrics.ts";
import pMap from "p-map";
import type { PlayWith } from "../common/database/drizzle/drizzleTypes.ts";

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

export interface ApiArgs {
    app: Express
    router: ReturnType<typeof createTypedRouter>
    scrobbleSources: ScrobbleSources
    scrobbleClients: ScrobbleClients
}

export interface ApiOptions {
    logger?: Logger
    appLoggerStream?: PassThrough
    initialLogOutput?: LogDataPretty[]
    testMode?: boolean
}

export const setupApi = (args: ApiArgs, opts: ApiOptions = {}) => {
    const {
        app,
        router,
        scrobbleSources,
        scrobbleClients
    } = args;
    const {
        logger = loggerTest,
        appLoggerStream = new PassThrough(),
        initialLogOutput = [],
        testMode
    } = opts;
    
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

    const componentAwareMiddle = makeComponentMiddle(scrobbleSources, scrobbleClients);

    const setLogWebSettings: TypedMiddleware = async (req, res, next) => {
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

    router.get('/api/logs/stream', {middleware: [setLogWebSettings], tags: ['Events'], summary: 'SSE Logs'}, async (req, res) => {
        const session = await bsseDef.createSession(req, res);
        await session.stream(logObjectStream);
    });

    router.get('/api/logs', {middleware: [setLogWebSettings], tags: ['Events'], summary: 'Get Logs'}, async (req, res) => {
        const slicedLog = getLogs(logger.levels.values[logConfig.level], logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        return res.json({data: slicedLog, settings: logConfig});
    });

    router.put('/api/logs', {
        bodySchema: z.object({level: logLevelStandaloneSchema, limit: z.int().positive().max(500)}),
        tags: ['Events'],
        summary: 'Update Log Settings'
    }, async (req, res) => {
        logConfig.level = req.body.level as LogLevel | undefined ?? logConfig.level;
        logConfig.limit = req.body.limit ?? logConfig.limit;
        const slicedLog = getLogs(logger.levels.values[logConfig.level], logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        // @ts-expect-error logLevel not part of session
        req.session.logLevel = logConfig.level;
        // @ts-expect-error limit not part of session
        req.session.limit = logConfig.limit;
        return res.json({data: slicedLog, settings: logConfig});
    });

    router.get('/api/events', {querySchema: z.object({
        next: z.literal('true').optional().meta({description: 'When used events are sent in new ui format'})
    }), tags: ['Events'], summary: 'SSE Events'}, async (req, res) => {
        const {
            query: {
                next: nextQs
            }
        } = req;

        const isNextapi = nextQs === 'true';

        const session = await bsseDef.createSession(req, res);
        scrobbleSources.emitter.onAny((eventName: string, payload: any) => {
            if(payload !== undefined && payload.from !== undefined) {
                if(isNextapi) {
                    session.push({event: eventName, ...payload}, eventName);
                } else {
                    session.push({event: eventName, ...payload}, payload.from);
                }
            }
        });
        scrobbleClients.emitter.onAny((eventName: string, payload: any) => {
            if(payload !== undefined && payload.from !== undefined) {
                if(isNextapi) {
                    session.push({event: eventName, ...payload}, eventName);
                } else {
                    session.push({event: eventName, ...payload}, payload.from);
                }
            }
        });
    });

    setupDeezerRoutes(app, logger, scrobbleSources);
    setupWebscrobblerRoutes(app, router, logger, scrobbleSources);
    setupLZEndpointRoutes(app, router, logger, scrobbleSources, scrobbleClients);
    setupLastfmEndpointRoutes(app, router, logger, scrobbleSources);
    setupAuthRoutes(app, router, logger, scrobbleSources, scrobbleClients);

    router.get('/api/components', {tags: ['Source/Client'], summary: 'Get All Sources/Clients'}, async (req, res, next) => {

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

    router.get('/api/components/:id/players', {middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Source/Client Players'}, async (req, res, next) => {
        if(req.component instanceof MemorySource) {
            return res.json(req.component.playersToObject());
        } else if(req.component instanceof AbstractScrobbleClient && req.component.nowPlayingEnabled) {
            return res.json(req.component.getNowPlayingPlayers());
        }
        return res.json({});
    });

    router.get('/api/components/:id/players/:platformId', {middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Specific Source/Client Player'}, async (req, res, next) => {
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

    router.get('/api/components/:id', {middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Source/Client'}, async (req, res) => {
        const {
            component,
        } = req;
        return res.json(component.getApiData());
    });
    
    router.post('/api/components/:id/state',
   {
    middleware: [componentAwareMiddle, bodyParser.json({ type: ['text/*', 'application/json'] })],
    bodySchema: componentStateBodySchema,
    tags: ['Source/Client'],
    summary: 'Update Source/Client State'
},
     async (req, res) => {
        const {
            component,
            body: {
                state,
                reason = 'invoked by api'
            }
        } = req;
        switch (state) {
            case 'stop':
                try {
                    await component.stop({ reason: new SimpleError(reason, {simple: true, shortStack: true}) })
                } catch (e) {
                    return res.status(500).json({ error: serializeError(e) });
                }
                break;
            case 'start':
                try {
                    await component.start({ forceInit: true })
                } catch (e) {
                    return res.status(500).json({ error: serializeError(e) });
                }
                break;
            case 'restart':
                try {
                    await component.restart({ forceInit: true, reason: new SimpleError(reason, {simple: true, shortStack: true}) })
                } catch (e) {
                    return res.status(500).json({ error: serializeError(e) });
                }
                break;
            case 'ignore':
                component.monitoringActivity = component.getSystemMonitoring() === false ? undefined : false;
                component.emitComponentUpdate({state: component.getRunningState()});
                break;
            case 'monitor':
                component.monitoringActivity = component.getSystemMonitoring() === true ? undefined : true;
                component.emitComponentUpdate({state: component.getRunningState()});
                break;
            default:
                return res.status(400).json({ error: { message: `'state' type ${state} was not handled` } });
        }
        return res.sendStatus(200);
    });

    router.post('/api/components/:id/auth', {
        middleware: [componentAwareMiddle],
        tags: ['Source/Client'],
        summary: 'Test Source/Client Authentication'
    }, async (req, res, next) => {
        const {
            component,
        } = req;
        let didAuth = false;
        try {
            logger.verbose('User requested auth test');
            await component.testAuth(true);
            component.clearErrors({predicate: x => findAuthIssue(x) !== undefined});
            didAuth = true;
            return res.sendStatus(200);
        } catch (e) {
            component.replaceErrors(e, {predicate: x => findAuthIssue(x) !== undefined});
            return res.status(500).json({error: serializeError(e)});
        } finally {
            const data = component.getApiData();
            component.emitComponentUpdate({
                errors: data.errors,
                state: data.state,
                status: didAuth ? 'Authenticated successfully' : data.status
            });
        }
    });

    router.get('/api/components/:id/plays', {
        middleware: [componentAwareMiddle],
        tags: ['Plays'],
        summary: 'Get Paginated Plays'
    }, async (req, res, next) => {
        const {
            component,
            query
        } = req;

        const hydratedQuery = asDayjsHydratedObject<QueryPlaysOptsJson, QueryPlaysOpts<Dayjs>>(query);
        const playRes = await component.getPlaysPaginated(hydratedQuery);

        // @ts-expect-error its fine
        playRes.data = playRes.data.map(x => asSerializablePlaySelect(x))
        //PlayApiCommonDetailed
        // plus paginatioon
        return res.json(playRes);
    });

    router.get('/api/components/:id/plays/:uid', {
        middleware: [componentAwareMiddle],
        tags: ['Plays'],
        summary: 'Get Play'
    }, async (req, res, next) => {
        const {
            component,
            params: {
                uid: playUid
            }
        } = req;

        const playRes = await component.getPlayApiResponse(playUid as string);
        //PlayApiCommonDetailed
        // plus paginatioon
        return res.json(asSerializablePlaySelect(playRes));
    });

    router.delete('/api/components/:id/plays/:uid', {
        middleware: [componentAwareMiddle],
        querySchema: z.object({children: z.stringbool().optional()}),
        tags: ['Plays'],
        summary: 'Delete Play'
    }, async (req, res, next) => {
        const {
            component,
            query: {
                children
            },
            params: {
                uid: playUid
            }
        } = req;

        const play = await component.playRepo.findByUidWith<'children'>(playUid, ['children']);
        if(play === undefined) {
            return res.sendStatus(404);
        }

        await component.deletePlay(play);

        return res.sendStatus(200);
    });

    router.post('/api/components/:id/plays/queue', {
        middleware: [componentAwareMiddle,bodyParser.json({ type: ['text/*', 'application/json'] })],
        bodySchema: z.object({
            context: queueContextSchema.optional(),
            filters: z.looseObject({})
        }),
        tags: ['Plays'],
        summary: 'Requeue Bulk Plays'
    }, async (req, res, next) => {
        const {
            component,
            body
        } = req;

        const hydratedQuery = asDayjsHydratedObject<QueryPlaysOptsJson, QueryPlaysOpts<Dayjs>>({...body.filters, with: ['queues']});
        res.sendStatus(200);

        const queueFunc = component instanceof AbstractSource ? 
        async (p: PlayWith<'queueStates'>) => await component.queuePlay([p], {...body.context, isRetry: true, reason: 'User requested reprocessing'})
        : async (p: PlayWith<'queueStates'>) => await component.queueScrobble([p], {...body.context, isRetry: true, reason: 'User requested reprocessing'});

        const currentFilters = hydratedQuery;
        let more = true;
        while(more) {
            const res = await component.getPlaysPaginatedInternal(currentFilters);
            pMap(res.data, async (x) => await queueFunc(x), {concurrency: 5});
            more = res.data.length === res.meta.limit;
            if(more) {
                currentFilters.offset += res.meta.limit
            }
        }
    });

    router.post('/api/components/:id/plays/:uid/queue', {
        middleware: [componentAwareMiddle],
        bodySchema: queueContextSchema.optional(),
        tags: ['Plays'],
        summary: 'Requeue a Play'
    }, async (req, res, next) => {
        const {
            component,
            params: {
                uid: playUid
            }, 
            body = {}
        } = req;

        const play = await component.playRepo.findByUid(playUid);
        if(play === undefined) {
            return res.sendStatus(404);
        }

        if(component instanceof AbstractSource) {
            await component.queuePlay([play], {...body, isRetry: true, reason: 'User requested reprocessing'});
        } else {
            await component.queueScrobble([play], {...body, isRetry: true, reason: 'User requested reprocessing'});
        }
        return res.sendStatus(200);
    });

    router.delete('/api/components/:id/plays/:uid/queue', {
        middleware: [componentAwareMiddle],
        tags: ['Plays'],
        summary: 'Dequeue a Play'
    }, async (req, res, next) => {
        const {
            component,
            params: {
                uid: playUid
            }
        } = req;

        const play = await component.playRepo.findByUid(playUid);
        if(play === undefined) {
            return res.sendStatus(404);
        }

        await component.cancelQueuedPlay(play);
        return res.sendStatus(200);
    });

    router.delete('/api/components/:id/plays/:uid/dead', {
        middleware: [componentAwareMiddle],
        tags: ['Plays'],
        summary: 'Mark Dead Play as Completed'
    }, async (req, res, next) => {
        const {
            component,
            params: {
                uid: playUid
            }
        } = req;

        const play = await component.playRepo.findByUid(playUid);
        if(play === undefined) {
            return res.sendStatus(404);
        }

        await component.removeDeadLetterScrobble(play);
        return res.sendStatus(200);
    });

    router.delete('/api/cache/:cacheType', {
        tags: ['Cache'],
        summary: 'Delete Cache By Type'
    }, async (req, res) => {
        const cache = await getRoot().items.cache();
        logger.verbose(`User request cache deletion for ${req.params.cacheType}`);
        switch(req.params.cacheType) {
            case 'external-api':
                await cache.cacheApi.clear();
                break;
            case 'transforms':
                await cache.cacheTransform.clear();
                break;
            default:
                return res.sendStatus(404);
        }
        logger.verbose('Cache cleared!');
        return res.sendStatus(204);
    });

    router.post('/api/components/:id/plays/historical', {
        middleware: [componentAwareMiddle],
        tags: ['Plays'],
        summary: 'Hydrate Historical Plays',
        description: 'If the Source/Client supports Historical Play capabilities, this route requests a manual hydration of all historical Plays'
    }, async (req, res, next) => {
        const {
            component,
        } = req;

        if(component instanceof AbstractHistoricalScrobbleClient) {
            component.logger.info('User requested historical play hydration');
            component.hydrateHistoricalScrobbles();
            res.status(200).send('OK');
        } else {
            component.logger.warn('This client does not have historical play capabilities');
            return res.status(409).json({error: 'This client does not have historical play capabilities'});
        }
    });

    router.get('/health', {hidden: true}, async (req, res) => res.redirect(307, `/api/${req.url.slice(1)}`));
    router.get('/api/health', {querySchema: z.object({type: z.string(), name: z.string()}).optional(), tags: ['App Meta']}, async (req, res) => {
        const {
            type,
            name
        } = req.query;

        const [sourcesReady, sourceMessages] = await scrobbleSources.getStatusSummary(type as string|undefined, name as string|undefined);
        const [clientsReady, clientMessages] = await scrobbleClients.getStatusSummary(type as string|undefined, name as string|undefined);


        return res.status((clientsReady && sourcesReady) ? 200 : 500).json({messages: sourceMessages.concat(clientMessages)});
    });

    if(testMode !== true) {
        registerMetrics(scrobbleSources, scrobbleClients);
        if(process.env.PROMETHEUS_FULL === 'true') {
            prom.collectDefaultMetrics();
        }
    }

    router.get('/api/metrics', {tags: ['App Meta']}, async (req, res) => {

        if(!hasMetricRepositories()) {
            const db = await getRoot().items.db();
            setMetricRepositories(new DrizzlePlayRepository(db),new DrizzlePlayHistoricalRepository(db))
        }

        const metricsString = await prom.register.metrics();
        return res
        .status(200)
        .set('Content-Type', 'text/plain')
        .send(metricsString);

    });

    router.get('/api/version', {tags: ['App Meta']}, async (req, res) => {
       return res.json({version: root.get('version')});
    });

    router.use('/api/docs', router.docs({
        title: "Multi-Scrobbler API",
        version: "0.1.0",
        description: "Public API docs",
    }))

    router.all('/api/*path', {hidden: true}, async (req, res) => {
        const remote = req.connection.remoteAddress;
        const proxyRemote = req.headers["x-forwarded-for"];
        const ua = req.headers["user-agent"];
        logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.originalUrl}`);
        return res.sendStatus(404);
    });
}
