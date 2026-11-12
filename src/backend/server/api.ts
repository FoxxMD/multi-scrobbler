import {loggerTest, type LogDataPretty, type Logger, type LogLevel} from "@foxxmd/logging";
import type {Express, Request, RequestHandler, Response} from 'express';
import { createChannel, createSession, type DefaultChannelState } from 'better-sse';
import bodyParser from "body-parser";
import { FixedSizeList } from 'fixed-size-list';
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
    type LogEvent,
    type LogOutputConfig,
    queueContextSchema,
    logLevelStandaloneSchema,
    trackSearchToMusicService,
    albumSearchToMusicService,
    artistSearchToMusicService,
    playEditStrictCreateSchema,
    type PlayObject,
    type MusicServicesBase,
} from "../../core/Atomic.ts";
import type {LeveledLogData} from "../common/infrastructure/Atomic.ts";
import { getRoot } from "../ioc.ts";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.ts";;
import MemorySource from "../sources/MemorySource.ts";
import { setupAuthRoutes } from "./auth.ts";
import {setupLZEndpointRoutes} from "./endpointListenbrainzRoutes.ts";
import {setupLastfmEndpointRoutes} from "./endpointLastfmRoutes.ts";
import { makeComponentMiddle, type WebFault } from "./middleware.ts";
import { parseBool } from "../utils.ts";
import { setupWebscrobblerRoutes } from "./webscrobblerRoutes.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import prom from 'prom-client';
import { findAuthIssue, SimpleError } from "../common/errors/MSErrors.ts";
import { DrizzlePlayRepository, type QueryPlaysOpts, type QueryPlaysOptsJson } from "../common/database/drizzle/repositories/PlayRepository.ts";
import AbstractHistoricalScrobbleClient from "../scrobblers/AbstractHistoricalScrobbleClient.ts";
import { DrizzlePlayHistoricalRepository } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import {componentStateBodySchema, playStateBodySchema, type ComponentClientApiJson, type ComponentSourceApiJson, asSerializablePlaySelect, trackDataCreditBaseSchema, type TrackDataCreditBase, NDJSON_MEDIA_TYPE, trackSearchSimpleRequestQuerySchema, albumSearchSimpleRequestQuerySchema, artistSearchSimpleRequestQuerySchema } from "../../core/Api.ts";
import { asDayjsHydratedObject } from "../../core/DataUtils.ts";
import dayjs, {type Dayjs} from "dayjs";
import { playDataStrictSchema, type JsonPlayObject } from "../../core/Atomic.ts";
import { serializeError } from "serialize-error";
import { z } from 'zod';
import type { createTypedRouter, TypedMiddleware } from "@minisylar/express-typed-router";
import { hasMetricRepositories, registerMetrics, setMetricRepositories } from "./promMetrics.ts";
import pMap from "p-map";
import type { PlayWith } from "../common/database/drizzle/drizzleTypes.ts";
import { stripIndents } from "common-tags";
import { nameToCredit } from "../../core/MusicMetadata.ts";
import { asPlayCheap } from "../../core/PlayMarshalUtils.ts";
import { getOwnerId } from "../common/auth/owner.ts";
import { getNowPlayingOptions, getPublicDashboardEntry } from "../common/dashboard.ts";
import { deleteUserSetting, getUserSetting, getUserSettings, isUserSettingKey, setUserSetting, type UserSettingKey } from "../common/auth/userSettings.ts";
import type { ServerLocals } from "./index.ts";

const maxBufferSize = 300;

const noopMiddleware: RequestHandler = (req, res, next) => next();
const output: Record<number, FixedSizeList<LogDataPretty>> =  {};

const jsonParser = bodyParser.json({ type: ['text/*', 'application/json'] });

export const HIDDEN_FROM_WEB = '[setup token hidden: see the server console/log file]';

/**
 * Remove secrets (setup token) from a log line before it reaches the dashboard (/logs and SSE).
 * The console and log files keep the full line.
 * */
export const hideSecrets = (log: LogDataPretty, secrets: string[]): LogDataPretty => {
    if (secrets.length === 0) {
        return log;
    }
    const str = JSON.stringify(log);
    if (!secrets.some(x => str.includes(x))) {
        return log;
    }
    return JSON.parse(secrets.reduce((acc, x) => acc.replaceAll(JSON.stringify(x).slice(1, -1), HIDDEN_FROM_WEB), str));
}

const createAddToLogBuffer = (levelMap:  {[p: number]: string}) => (log: LogDataPretty) => {
    output[log.level].add({...log, levelLabel: levelMap[log.level]});
}

const getLogs = (minLevel: number, limit: number = maxBufferSize, sort: 'asc' | 'desc' = 'desc'): LeveledLogData[] => {
    const allLogs: LeveledLogData[][] = [];
    for(const level of Object.keys(output)) {
        if(Number.parseInt(level) >= minLevel) {
            allLogs.push(output[level as unknown as number].data as LeveledLogData[]);
        }
    }
    if(sort === 'desc') {
        return allLogs.flat(1).sort((a, b) => b.time - a.time).slice(0, limit);
    }
    return allLogs.flat(1).sort((a, b) => a.time - b.time).slice(0, limit);
}

export interface ApiArgs {
    app: Express
    /** routes that require auth, mounted at /api (route paths are relative to /api) */
    router: ReturnType<typeof createTypedRouter>
    /** routes that never require auth, mounted at the base path */
    publicRouter: ReturnType<typeof createTypedRouter>
    /** resolves req.auth without rejecting, for public routes that show more to a logged in user */
    optionalAuth?: RequestHandler
    /** values that must never be sent to the browser in logs (setup token) */
    hiddenFromWeb?: string[]
    scrobbleSources: ScrobbleSources
    scrobbleClients: ScrobbleClients
}

export interface ApiOptions {
    logger?: Logger
    appLoggerStream?: PassThrough
    initialLogOutput?: LogDataPretty[]
    testMode?: boolean
    webFault?: WebFault
}

export const setupApi = (args: ApiArgs, opts: ApiOptions = {}) => {
    const {
        app,
        router,
        publicRouter,
        optionalAuth = noopMiddleware,
        hiddenFromWeb = [],
        scrobbleSources,
        scrobbleClients
    } = args;
    const {
        logger = loggerTest,
        appLoggerStream = new PassThrough(),
        initialLogOutput = [],
        testMode,
        webFault
    } = opts;
    
    for(const level of Object.keys(logger.levels.labels)) {
        output[level as unknown as number] = new FixedSizeList<LeveledLogData>(maxBufferSize);
    }

    const addToLogBuffer = createAddToLogBuffer(logger.levels.labels);
    for(const log of initialLogOutput) {
        addToLogBuffer(hideSecrets(log, hiddenFromWeb));
    }
    const root = getRoot();

    //let logWebLevel: LogLevel = logger.level as LogLevel || (process.env.LOG_LEVEL || 'info') as LogLevel;

    const logConfig: LogOutputConfig = {
        level: logger.level as LogLevel || (process.env.LOG_LEVEL || 'trace') as LogLevel,
        sort: 'descending',
        limit: 50,
    }

    // tab is a client-generated connection id, logs is opt-in so log events are only pushed to clients actually rendering them
    const eventsChannel = createChannel<DefaultChannelState, {tab?: string, logs: boolean}>();

    // runs synchronously inside source/client emit() calls so it must never throw back into them
    const forwardEvent = (eventName: string, payload: any) => {
        if(payload !== undefined && payload.from !== undefined) {
            try {
                eventsChannel.broadcast({event: eventName, ...payload}, eventName);
            } catch (e) {
                logger.warn(new Error(`Failed to forward '${eventName}' event to SSE clients`, {cause: e}));
            }
        }
    };
    scrobbleSources.emitter.onAny(forwardEvent);
    scrobbleClients.emitter.onAny(forwardEvent);

    // only warn on the first failure until forwarding succeeds again
    // otherwise the warning is itself a log line that fails to forward, logging another warning, forever
    let logForwardFailing = false;
    appLoggerStream.on('data', (rawLog: LogDataPretty) => {
        try {
            const log = hideSecrets(rawLog, hiddenFromWeb);
            addToLogBuffer(log);
            if(log.level >= logger.levels.values[logConfig.level]) {
                eventsChannel.broadcast({message: log.line, level: log.level, levelLabel: logger.levels.labels[log.level]} satisfies LogEvent, 'log', {filter: (s) => s.state.logs});
            }
            logForwardFailing = false;
        } catch (e) {
            if(!logForwardFailing) {
                logForwardFailing = true;
                logger.warn(new Error('Failed to forward log line to SSE clients, further failures will not be logged until forwarding recovers', {cause: e}));
            }
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

    router.get('/logs', {docs: {operationId: 'get-logs'}, middleware: [setLogWebSettings], tags: ['Events'], summary: 'Get Logs'}, async (req, res) => {
        const slicedLog = getLogs(logger.levels.values[logConfig.level], logConfig.limit + 1, logConfig.sort === 'ascending' ? 'asc' : 'desc');
        return res.json({data: slicedLog, settings: logConfig});
    });

    router.put('/logs', {
        docs: {operationId: 'update-log-settings'},
        middleware: [jsonParser],
        bodySchema: z.object({
            level: logLevelStandaloneSchema.optional(),
            limit: z.int().positive().max(500).optional()
        }),
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

    router.get('/events', {docs: {operationId: 'sse-events'}, querySchema: z.object({
        tab: z.string().optional().meta({description: 'Client-generated connection id. Required to opt in to log events via PUT /api/events/:tab/logs'})
    }), middleware: [setLogWebSettings], tags: ['Events'], summary: 'SSE Events'}, async (req, res) => {
        const session = await createSession(req, res, {state: {tab: req.query.tab, logs: false}});
        eventsChannel.register(session);
    });

    router.put('/events/:tab/logs', {
        middleware: [jsonParser],
        hidden: true,
        bodySchema: z.object({
            enabled: z.boolean()
        }),
        tags: ['Events'],
        summary: 'Toggle Log Events',
        description: 'Enable or disable log events for the /api/events connection opened with this tab id'
    }, async (req, res) => {
        // may briefly be more than one if an old connection for the same tab hasn't closed yet
        const sessions = eventsChannel.activeSessions.filter((s) => s.state.tab === req.params.tab);
        if(sessions.length === 0) {
            return res.sendStatus(404);
        }
        for(const s of sessions) {
            s.state.logs = req.body.enabled;
        }
        return res.sendStatus(200);
    });

    /**
     * Resolve which user's setting is accessed and reject the request if not allowed. `me` means the requester.
     * Users may only access their own settings (ponytail: admin access to other users comes with an admin plugin)
     * */
    const userSettingTarget = (requester: string, res: Response, params: {userId: string, key?: string}): string | undefined => {
        const userId = params.userId === 'me' ? requester : params.userId;
        if (userId !== requester) {
            res.status(403).json({error: 'Cannot access settings of another user'});
            return undefined;
        }
        if (params.key !== undefined && !isUserSettingKey(params.key)) {
            res.status(404).json({error: `Unknown setting '${params.key}'`});
            return undefined;
        }
        return userId;
    }

    router.get('/user/:userId/setting', {
        docs: {operationId: 'get-user-settings'},
        tags: ['User'],
        summary: 'Get All User Settings',
        description: "Get all of a user's settings that are set, as an object keyed by setting name. Use `me` as the userId for the requesting user."
    }, async (req, res) => {
        const userId = userSettingTarget(req.auth!.userId, res, req.params);
        if (userId === undefined) {
            return;
        }
        const {db} = req.app.locals as ServerLocals;
        return res.json(await getUserSettings(db, userId));
    });

    router.get('/user/:userId/setting/:key', {
        docs: {operationId: 'get-user-setting'},
        tags: ['User'],
        summary: 'Get User Setting',
        description: "Get one of a user's settings. Use `me` as the userId for the requesting user. `value` is null when the setting is not set."
    }, async (req, res) => {
        const userId = userSettingTarget(req.auth!.userId, res, req.params);
        if (userId === undefined) {
            return;
        }
        const {db} = req.app.locals as ServerLocals;
        const value = await getUserSetting(db, userId, req.params.key as UserSettingKey);
        return res.json({key: req.params.key, value: value ?? null});
    });

    router.put('/user/:userId/setting/:key', {
        docs: {operationId: 'update-user-setting'},
        middleware: [jsonParser],
        bodySchema: z.object({
            value: z.unknown().meta({description: 'Validated against the schema for this setting key'})
        }),
        tags: ['User'],
        summary: 'Update User Setting',
        description: "Set one of a user's settings. Use `me` as the userId for the requesting user."
    }, async (req, res) => {
        const userId = userSettingTarget(req.auth!.userId, res, req.params);
        if (userId === undefined) {
            return;
        }
        const {db} = req.app.locals as ServerLocals;
        try {
            const value = await setUserSetting(db, userId, req.params.key, req.body.value);
            return res.json({key: req.params.key, value});
        } catch (e) {
            if (e instanceof z.ZodError) {
                return res.status(400).json({error: `Invalid value for '${req.params.key}': ${z.prettifyError(e)}`});
            }
            throw e;
        }
    });

    router.delete('/user/:userId/setting/:key', {
        docs: {operationId: 'delete-user-setting'},
        tags: ['User'],
        summary: 'Reset User Setting',
        description: "Unset one of a user's settings so the default is used. Use `me` as the userId for the requesting user."
    }, async (req, res) => {
        const userId = userSettingTarget(req.auth!.userId, res, req.params);
        if (userId === undefined) {
            return;
        }
        const {db} = req.app.locals as ServerLocals;
        await deleteUserSetting(db, userId, req.params.key);
        return res.json({key: req.params.key, value: null});
    });

    setupWebscrobblerRoutes(app, publicRouter, logger, scrobbleSources);
    setupLZEndpointRoutes(app, publicRouter, logger, scrobbleSources, scrobbleClients);
    setupLastfmEndpointRoutes(app, publicRouter, logger, scrobbleSources);
    setupAuthRoutes(app, router, logger, scrobbleSources, scrobbleClients);

    router.get('/components', {docs: {operationId: 'get-all-sources-clients'}, tags: ['Source/Client'], summary: 'Get All Sources/Clients'}, async (req, res, next) => {

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

    router.get('/components/:id/players', {docs: {operationId: 'get-source-client-players'}, middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Source/Client Players'}, async (req, res, next) => {
        if(req.component instanceof MemorySource) {
            return res.json(req.component.playersToObject());
        } else if(req.component instanceof AbstractScrobbleClient && req.component.nowPlayingEnabled) {
            return res.json(req.component.getNowPlayingPlayers());
        }
        return res.json({});
    });

    router.get('/components/:id/players/:platformId', {docs: {operationId: 'get-specific-source-client-player'}, middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Specific Source/Client Player'}, async (req, res, next) => {
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

    router.get('/components/:id', {docs: {operationId: 'get-source-client'}, middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Source/Client'}, async (req, res) => {
        const {
            component,
        } = req;
        return res.json(component.getApiData());
    });
    
    router.post('/components/:id/state',
   {
    docs: {operationId: 'update-source-client-state'},
    middleware: [componentAwareMiddle, jsonParser],
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

    router.post('/components/:id/auth', {
        docs: {operationId: 'test-source-client-authentication'},
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
            component.replaceErrors(e as Error, {predicate: x => findAuthIssue(x) !== undefined});
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

    router.get('/components/:id/art', {
        docs: {operationId: 'get-external-art'},
        middleware: [componentAwareMiddle],
        querySchema: z.looseObject({}),
        tags: ['Source/Client'],
        summary: 'Get External Art',
        description: stripIndents`Fetches and returns art from the upstream/downstream external service
Note: this is only supported by some components.`
    }, async (req, res, next) => {
        const {
            component,
            query
        } = req;

        if('getExternalArt' in component && typeof component.getExternalArt === 'function') {
            const [stream, contentType] = await component.getExternalArt(query);
            res.writeHead(200, {'Content-Type': contentType});
            try {
                // pipeline, unlike pipe, propagates source stream errors instead of leaving them unhandled
                await pipeline(stream, res);
                return;
            } catch (e) {
                logger.error(new Error(`Error occurred while trying to stream art for Component ${component.componentId}`, {cause: e}));
                if(res.headersSent) {
                    // response is partially written, can't send an error body
                    res.destroy();
                    return;
                }
                return res.status(500).json({message: 'Error during art retrieval'});
            }
        }

        return res.status(501).json({error: {message: `Component ${component.componentId} does not support art retrieval`}});
    });

    router.get('/components/:id/plays', {
        docs: {operationId: 'get-paginated-plays'},
        middleware: [componentAwareMiddle],
        tags: ['Plays'],
        summary: 'Get Paginated Plays'
    }, async (req, res, next) => {
        const {
            component,
            query
        } = req;

        const hydratedQuery = asDayjsHydratedObject<QueryPlaysOptsJson, QueryPlaysOpts<Dayjs>>(query as QueryPlaysOptsJson);
        const playRes = await component.getPlaysPaginated(hydratedQuery);

        // @ts-expect-error its fine
        playRes.data = playRes.data.map(x => asSerializablePlaySelect(x))
        //PlayApiCommonDetailed
        // plus paginatioon
        return res.json(playRes);
    });

    router.get('/components/:id/plays/:uid', {
        docs: {operationId: 'get-play'},
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

    router.delete('/components/:id/plays/:uid', {
        docs: {operationId: 'delete-play'},
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

    router.put('/components/:id/plays/:uid/play', {
        docs: {operationId: 'update-play'},
        middleware: [componentAwareMiddle,jsonParser],
        tags: ['Plays'],
        summary: 'Update Play',
        bodySchema: playEditStrictCreateSchema
    }, async (req, res, next) => {
        const {
            component,
            params: {
                uid: playUid
            },
            body
        } = req;

        const play: PlayObject = asPlayCheap(body);

        const playRes = await component.updatePlay(playUid as string, play.data);
        return res.json(asSerializablePlaySelect(playRes));
    });

    router.post('/scrobble', {
        docs: {operationId: 'manual-scrobble'},
        middleware: [jsonParser],
        tags: ['Plays'],
        summary: 'Manual Scrobble',
        description: 'Scrobble a play by hand to Clients, using the same path as Sources. playDate defaults to now. Omit or empty clients to scrobble to all Clients.',
        bodySchema: z.object({
            play: playDataStrictSchema,
            clients: z.string().array().optional().meta({description: 'Client ids (uid). Empty or missing means all clients.'})
        })
    }, async (req, res) => {
        const {play: data, clients = []} = req.body;

        const jsonPlay: JsonPlayObject = {
            data: {...data, playDate: data.playDate ?? dayjs().toISOString()},
            meta: {source: 'manual'}
        };
        const play: PlayObject = asPlayCheap(jsonPlay);

        const playDate = dayjs(play.data.playDate);
        if (!playDate.isValid()) {
            return res.status(400).json({error: 'playDate is not a valid date'});
        }
        if (playDate.isAfter(dayjs().add(1, 'minute'))) {
            return res.status(400).json({error: 'playDate cannot be more than 1 minute in the future'});
        }

        if (clients.length > 0) {
            const known = scrobbleClients.clients.map(x => x.getUid());
            const unknown = clients.filter(x => !known.includes(x));
            if (unknown.length > 0) {
                return res.status(400).json({error: `Unknown client ids: ${unknown.join(', ')}`});
            }
        }

        await scrobbleClients.scrobble(play, {scrobbleTo: clients, scrobbleFrom: 'manual'});
        const queued = clients.length > 0 ? clients : scrobbleClients.clients.map(x => x.getUid());
        return res.status(202).json({queued});
    });

    router.post('/components/:id/plays/queue', {
        docs: {operationId: 'requeue-bulk-plays'},
        middleware: [componentAwareMiddle,jsonParser],
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

        const queueFunc = async (p: PlayWith<'queueStates'>) => await component.queuePlay([p], {...body.context, isRetry: true, reason: 'User requested reprocessing'});

        const currentFilters = hydratedQuery;
        let more = true;
        while(more) {
            const res = await component.getPlaysPaginatedInternal(currentFilters);
            pMap(res.data, async (x) => await queueFunc(x), {concurrency: 5});
            more = res.data.length === res.meta.limit;
            if(more) {
                currentFilters.offset = (currentFilters.offset ?? 0) + res.meta.limit
            }
        }
    });

    router.post('/components/:id/plays/:uid/queue', {
        docs: {operationId: 'requeue-a-play'},
        middleware: [componentAwareMiddle,jsonParser],
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

        await component.queuePlay([play], {...body, isRetry: true, reason: 'User requested reprocessing'});
        return res.sendStatus(200);
    });

    router.delete('/components/:id/plays/:uid/queue', {
        docs: {operationId: 'dequeue-a-play'},
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

        const play = await component.playRepo.findByUidWith<'queueStates' | 'events'>(playUid, ['queues','events']);
        if(play === undefined) {
            return res.sendStatus(404);
        }

        await component.cancelQueuedPlay(play);
        return res.sendStatus(200);
    });

    router.post('/components/:id/plays/:uid/state', {
        docs: {operationId: 'mark-play-as-done'},
        middleware: [componentAwareMiddle, jsonParser],
        bodySchema: playStateBodySchema,
        tags: ['Plays'],
        summary: 'Mark Play as Done'
    }, async (req, res, next) => {
        const {
            component,
            params: {
                uid: playUid
            },
            body: {
                state
            }
        } = req;

        const play = await component.playRepo.findByUidWith<'queueStates' | 'events'>(playUid, ['queues','events']);
        if(play === undefined) {
            return res.sendStatus(404);
        }

        switch(state) {
            case 'discarded':
                await component.markPlayDiscarded(play);
                break;
            default:
                return res.status(400).json({error: {message: `Play state '${state}' is not supported.`}});
        }

        return res.sendStatus(200);
    });

    router.delete('/cache/:cacheType', {
        docs: {operationId: 'delete-cache-by-type'},
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

    router.post('/components/:id/plays/historical', {
        docs: {operationId: 'hydrate-historical-plays'},
        middleware: [componentAwareMiddle,jsonParser],
        tags: ['Plays'],
        summary: 'Hydrate Historical Plays',
        bodySchema: z.object({type: z.enum(['full','recent']).optional().meta({
            description: `Use \`full\` to initiate a complete sync of all history or \`recent\` to sync the last ~100 plays.`
        })}).optional(),
        description: 'If the Source/Client supports Historical Play capabilities, this route requests a manual hydration of historical Plays'
    }, async (req, res, next) => {
        const {
            component,
            body: {
                type: syncType = 'recent'
            }
        } = req as Omit<typeof req, 'body'> & {body: NonNullable<typeof req.body>};

        if(component instanceof AbstractHistoricalScrobbleClient) {
            component.logger.info('User requested historical play hydration');
            if(syncType === 'full') {
                component.hydrateHistoricalScrobbles();
            } else {
                component.syncRecentHistoricalScrobbles()
                .then(() => null)
                .catch((e) => component.logger.error(new SimpleError('Sync attempt failed', {cause: e})));
            }
            res.status(200).send('OK');
        } else {
            component.logger.warn('This client does not have historical play capabilities');
            return res.status(409).json({error: 'This client does not have historical play capabilities'});
        }
    });

    const streamDescription = `Send the header \`Accept: ${NDJSON_MEDIA_TYPE}\` to get results as newline-delimited JSON, one line per provider as soon as it finishes: \`{"type":"result","service":"...","data":[...]}\` or \`{"type":"error","service":"...","error":{...}}\`, followed by a final \`{"type":"done"}\` line.`;

    /** Responds with plain JSON once all providers finish or, if the client asks for NDJSON, with a line per provider as each one finishes */
    const sendSearchResults = async (req: Pick<Request, 'accepts'>, res: Response, kind: 'Track' | 'Album' | 'Artist', query: TrackDataCreditBase | MusicServicesBase) => {
        const tm = root.items.transformerManager;
        if(req.accepts(['json', NDJSON_MEDIA_TYPE]) !== NDJSON_MEDIA_TYPE) {
            return res.json(await tm[`get${kind}Results`](query));
        }
        res.set({
            'Content-Type': NDJSON_MEDIA_TYPE,
            'Cache-Control': 'no-cache, no-transform',
            // nginx buffers proxied responses unless told not to
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders();
        try {
            for await (const line of tm[`stream${kind}Results`](query)) {
                if(res.destroyed) {
                    // client went away
                    return;
                }
                res.write(`${JSON.stringify(line)}\n`);
            }
            res.write(`${JSON.stringify({type: 'done'})}\n`);
        } catch (e) {
            // headers are already sent so the missing 'done' line is what tells the client this failed
            logger.error(new Error(`Metadata search stream failed`, {cause: e}));
        }
        return res.end();
    }

    router.get('/metadata/search/tracks', {
        docs: {operationId: 'get-track-metadata-from-providers'},
        tags: ['Metadata'],
        summary: 'Get Track Metadata from Providers',
        querySchema: trackSearchSimpleRequestQuerySchema,
        description: `Gets track results from all metadata providers. ${streamDescription}`
    }, async (req, res, next) => {
        const {
            query: {
                track,
                artists = [],
                album
            }
        } = req;

        const musicServiceMeta = trackSearchToMusicService(track);
        if(musicServiceMeta !== undefined) {
            return sendSearchResults(req, res, 'Track', musicServiceMeta);
        }
        return sendSearchResults(req, res, 'Track', {
            track: nameToCredit(track),
            artists: artists.length === 0 ? undefined : artists.map((x) => nameToCredit(x)),
            album: nameToCredit(album)
        });
    });
    router.post('/metadata/search/tracks', {
        docs: {operationId: 'get-track-metadata-from-providers-advanced'},
        tags: ['Metadata'],
        middleware: [jsonParser],
        summary: 'Get Track Metadata from Providers (Advanced)',
        bodySchema: trackDataCreditBaseSchema.required({track: true}),
        description: `Gets track results from all metadata providers using Credits with metadata. ${streamDescription}`
    }, async (req, res, next) => {
        const {
            body
        } = req;
        return sendSearchResults(req, res, 'Track', body);
    });

    router.get('/metadata/search/albums', {
        docs: {operationId: 'get-album-metadata-from-providers'},
        tags: ['Metadata'],
        summary: 'Get Album Metadata from Providers',
        querySchema: albumSearchSimpleRequestQuerySchema,
        description: `Gets album results from all metadata providers. ${streamDescription}`
    }, async (req, res, next) => {
        const {
            query: {
                album,
                artists = []
            }
        } = req;

        const musicServiceMeta = albumSearchToMusicService(album);
        if(musicServiceMeta !== undefined) {
            return sendSearchResults(req, res, 'Album', musicServiceMeta);
        }
        return sendSearchResults(req, res, 'Album', {
            artists: artists.length === 0 ? undefined : artists.map((x) => nameToCredit(x)),
            album: nameToCredit(album)
        });
    });
    router.post('/metadata/search/albums', {
        docs: {operationId: 'get-album-metadata-from-providers-advanced'},
        tags: ['Metadata'],
        middleware: [jsonParser],
        summary: 'Get Album Metadata from Providers (Advanced)',
        bodySchema: trackDataCreditBaseSchema.required({album: true}).omit({track: true}),
        description: `Gets album results from all metadata providers using Credits with metadata. ${streamDescription}`
    }, async (req, res, next) => {
        const {
            body
        } = req;
        return sendSearchResults(req, res, 'Album', body);
    });

    router.get('/metadata/search/artists', {
        docs: {operationId: 'get-artist-metadata-from-providers'},
        tags: ['Metadata'],
        summary: 'Get Artist Metadata from Providers',
        querySchema: artistSearchSimpleRequestQuerySchema,
        description: `Gets artist results from all metadata providers. ${streamDescription}`
    }, async (req, res, next) => {
        const {
            query: {
                artist
            }
        } = req;

        const musicServiceMeta = artistSearchToMusicService(artist);
        if(musicServiceMeta !== undefined) {
            return sendSearchResults(req, res, 'Artist', musicServiceMeta);
        }

        return sendSearchResults(req, res, 'Artist', {
            artists: [nameToCredit(artist)],
        });
    });
    router.post('/metadata/search/artists', {
        docs: {operationId: 'get-artist-metadata-from-providers-advanced'},
        tags: ['Metadata'],
        middleware: [jsonParser],
        summary: 'Get Artist Metadata from Providers (Advanced)',
        bodySchema: trackDataCreditBaseSchema.required({artists: true}).omit({track: true, album: true}),
        description: `Gets artist results from all metadata providers using Credits with metadata. ${streamDescription}`
    }, async (req, res, next) => {
        const {
            body
        } = req;
        return sendSearchResults(req, res, 'Artist', body);
    });

    publicRouter.get('/health', {hidden: true}, async (req, res) => res.redirect(307, `/api/${req.url.slice(1)}`));
    publicRouter.get('/api/health', {
        docs: {operationId: 'get-health'},
        middleware: [optionalAuth],
        querySchema: z.object({
            type: z.string().optional().meta({description: 'Only report status for components of this type. Ignored when not logged in.'}),
            name: z.string().optional().meta({description: 'Only report status for the component with this name. Ignored when not logged in.'})
        }),
        tags: ['App Meta'],
        description: 'Status code reports overall health (200 OK, 500 a Source/Client has issues, 503 safe mode). Status messages and filtering by type/name are only available when logged in (or the instance is not secured).'
    }, async (req, res) => {
        // without auth only the overall status is reported: component names, filtering and error details stay private
        const detailed = req.auth !== undefined;
        const {
            type,
            name
        } = detailed ? req.query : {};

        const [sourcesReady, sourceMessages] = await scrobbleSources.getStatusSummary(type, name);
        const [clientsReady, clientMessages] = await scrobbleClients.getStatusSummary(type, name);

        const messages = detailed ? sourceMessages.concat(clientMessages) : [];
        if(webFault?.fault !== undefined) {
            return res.status(503).json({messages: detailed ? [`Web server is in safe mode and must be restarted: ${webFault.fault.error.message}`, ...messages] : []});
        }
        return res.status((clientsReady && sourcesReady) ? 200 : 500).json({messages});
    });

    if(testMode !== true) {
        registerMetrics(scrobbleSources, scrobbleClients);
        if(process.env.PROMETHEUS_FULL === 'true') {
            prom.collectDefaultMetrics();
        }
    }

    // PROMETHEUS=false only removes the endpoint, metrics are still collected in-process
    const prometheusEnabled = parseBool(process.env.PROMETHEUS, true);
    if(prometheusEnabled) router.get('/metrics', {
        docs: {operationId: 'get-metrics'},
        tags: ['App Meta'],
        description: 'Prometheus metrics. Once the instance is secured scrape with a Read API key: `Authorization: Bearer <key>`. The endpoint is removed with PROMETHEUS=false.'
    }, async (req, res) => {

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

    publicRouter.get('/api/dashboard', {
        docs: {operationId: 'get-dashboard'},
        tags: ['App Meta'],
        description: 'Data for the default public dashboard, if it is enabled'
    }, async (req, res) => {
        const db = await root.items.db();
        const {data, expires} = await getPublicDashboardEntry(db, await getOwnerId(db), {sources: scrobbleSources.sources, clients: scrobbleClients.clients}, logger);
        // the same for every viewer. Clients poll at max-age, express adds the ETag and answers If-None-Match with 304
        res.set('Cache-Control', `public, max-age=${Math.max(0, Math.ceil((expires - Date.now()) / 1000))}`);
        return res.json(data);
    });

    router.get('/dashboard/now-playing-options', {
        docs: {operationId: 'get-dashboard-now-playing-options'},
        tags: ['App Meta'],
        description: 'Sources and clients that can be used as Now Playing for the public dashboard'
    }, async (req, res) => res.json(getNowPlayingOptions({sources: scrobbleSources.sources, clients: scrobbleClients.clients})));

    publicRouter.get('/api/version', {docs: {operationId: 'get-version'}, tags: ['App Meta']}, async (req, res) => {
       return res.json({version: root.get('version')});
    });

    // unknown /api routes (after auth, so it does not reveal which routes exist)
    router.all('/*path', {hidden: true}, async (req, res) => {
        const remote = req.connection.remoteAddress;
        const proxyRemote = req.headers["x-forwarded-for"];
        const ua = req.headers["user-agent"];
        logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.originalUrl}`);
        return res.sendStatus(404);
    });
}
