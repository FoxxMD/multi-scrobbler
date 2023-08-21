import {ExpressWithAsync} from "@awaitjs/express";
import {getRoot} from "../ioc";
import { capitalize } from "../utils";
import {makeClientCheckMiddle, makeSourceCheckMiddle} from "./middleware";
import AbstractSource from "../sources/AbstractSource";
import {
    ClientStatusData,
    LogInfo,
    LogInfoJson,
    LogLevel,
    LogOutputConfig,
    SourceStatusData,
} from "../../core/Atomic";
import {Logger} from "@foxxmd/winston";
import {formatLogToHtml, isLogLineMinLevel} from "../common/logging";
import {MESSAGE} from "triple-beam";
import {Transform} from "stream";
import {createSession} from "better-sse";
import {setupTautulliRoutes} from "./tautulliRoutes";
import {setupPlexRoutes} from "./plexRoutes";
import {setupJellyfinRoutes} from "./jellyfinRoutes";
import {setupDeezerRoutes} from "./deezerRoutes";
import {setupAuthRoutes} from "./auth";
import path from "path";
import {source} from "common-tags";
import { ExpressHandler } from "../common/infrastructure/Atomic";

const buildDir = path.join(process.cwd() + "/build");

let output: LogInfo[] = []

const availableLevels = ['error', 'warn', 'info', 'verbose', 'debug'];

export const setupApi = (app: ExpressWithAsync, logger: Logger, initialLogOutput: LogInfo[] = []) => {
    output = initialLogOutput;
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

    logger.stream().on('log', (log: LogInfo) => {
        output.unshift(log);
        output = output.slice(0, 501);
        if(isLogLineMinLevel(log, logConfig.level)) {
            logObjectStream.write({message: log[MESSAGE], level: log.level});
        }
    });

    const scrobbleSources = root.get('sources');
    const scrobbleClients = root.get('clients');

    const clientCheckMiddle = makeClientCheckMiddle(scrobbleClients);
    const sourceCheckMiddle = makeSourceCheckMiddle(scrobbleSources);

    const setLogWebLevel: ExpressHandler = async (req, res, next) => {
        // @ts-ignore
        const sessionLevel: LogLevel | undefined = req.session.logLevel as LogLevel | undefined;
        if(sessionLevel !== undefined && logConfig.level !== sessionLevel) {
            logConfig.level = sessionLevel;
        }
        next();
    }

    app.get('/api/logs/stream', setLogWebLevel, async (req, res) => {
        const session = await createSession(req, res);
        await session.stream(logObjectStream);
    });

    app.get('/api/logs', setLogWebLevel, async (req, res) => {
        let slicedLog = output.filter(x => isLogLineMinLevel(x, logConfig.level)).slice(0, logConfig.limit + 1);
        if (logConfig.sort === 'ascending') {
            slicedLog.reverse();
        }
        const jsonLogs: LogInfoJson[] = slicedLog.map(x => ({...x, formattedMessage: x[MESSAGE]}));
        return res.json({data: jsonLogs, settings: logConfig});
    });

    app.put('/api/logs', async (req, res) => {
        logConfig.level = req.body.level as LogLevel;
        let slicedLog = output.filter(x => isLogLineMinLevel(x, logConfig.level)).slice(0, logConfig.limit + 1);
        if (logConfig.sort === 'ascending') {
            slicedLog.reverse();
        }
        // @ts-ignore
        req.session.logLevel = logConfig.level;
        const jsonLogs: LogInfoJson[] = slicedLog.map(x => ({...x, formattedMessage: x[MESSAGE]}));
        return res.json({data: jsonLogs, settings: logConfig});
    });

    app.get('/api/events', async (req, res) => {
        const session = await createSession(req, res);
        scrobbleSources.emitter.on('*', (payload: any, eventName: string) => {
            if(payload.from !== undefined) {
                session.push({...payload.data, event: eventName}, payload.from);
            }
        });
    });

    setupTautulliRoutes(app, logger, scrobbleSources);
    setupPlexRoutes(app, logger, scrobbleSources);
    setupJellyfinRoutes(app, logger, scrobbleSources);
    setupDeezerRoutes(app, logger, scrobbleSources);
    setupAuthRoutes(app, logger, sourceCheckMiddle, clientCheckMiddle, scrobbleSources, scrobbleClients);

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
            };
            if (!initialized) {
                base.status = 'Not Initialized';
            } else if (requiresAuth && !authed) {
                base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
            } else if (canPoll) {
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
            const base: ClientStatusData = {
                status: '',
                type,
                display: capitalize(type),
                tracksDiscovered: tracksScrobbled,
                name,
                hasAuth: requiresAuth,
            };
            if (!initialized) {
                base.status = 'Not Initialized';
            } else if (requiresAuth && !authed) {
                base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
            } else {
                base.status = tracksScrobbled > 0 ? 'Received Data' : 'Awaiting Data';
            }
            return base;
        });
        return res.json({sources: sourceData, clients: clientData});
    });

    app.getAsync('/api/recent', sourceCheckMiddle, async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleSource: source,
        } = req;
        if (!source.canPoll) {
            return res.status(400).send(`Specified source cannot retrieve recent plays (${source.type})`);
        }

        const result = (source as AbstractSource).getFlatRecentlyDiscoveredPlays();
        //const artistTruncFunc = truncateStringToLength(Math.min(40, longestString(result.map((x: any) => x.data.artists.join(' / ')).flat())));
        //const trackLength = longestString(result.map((x: any) => x.data.track))
        return res.json(result);
    });

    app.use('/api/poll', sourceCheckMiddle);
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
                source.startPolling();
            }
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

    app.useAsync('/api/*', async function (req, res) {
        const remote = req.connection.remoteAddress;
        const proxyRemote = req.headers["x-forwarded-for"];
        const ua = req.headers["user-agent"];
        logger.debug(`Server received ${req.method} request from ${remote}${proxyRemote !== undefined ? ` (${proxyRemote})` : ''}${ua !== undefined ? ` (UA: ${ua})` : ''} to unknown route: ${req.url}`);
        return res.sendStatus(404);
    });

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
}
