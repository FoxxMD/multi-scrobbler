import 'dotenv/config';
import { childLogger, LogDataPretty, Logger as FoxLogger } from "@foxxmd/logging";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import isToday from 'dayjs/plugin/isToday.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import * as path from "path";
import { SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { projectDir } from "./common/index.ts";
import { AIOConfig } from "./common/infrastructure/config/aioConfig.ts";
import { appLogger, initLogger as getInitLogger } from "./common/logging.ts";
import { getRoot, parseVersion } from "./ioc.ts";
import { initServer } from "./server/index.ts";
import { createHeartbeatClientsTask } from "./tasks/heartbeatClients.ts";
import { createHeartbeatSourcesTask } from "./tasks/heartbeatSources.ts";
import { isDebugMode, parseBool, readJson, retry, sleep } from "./utils.ts";
import { createVegaGenerator } from './utils/SchemaUtils.ts';
import ScrobbleClients from './scrobblers/ScrobbleClients.ts';
import ScrobbleSources from './sources/ScrobbleSources.ts';

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);

// eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions
(async function () {

const scheduler = new ToadScheduler()

let output: LogDataPretty[] = []

const [parentInitLogger, initLoggerStream] = getInitLogger();
const initLogger = childLogger(parentInitLogger, 'Init');
initLoggerStream.on('data', (log: LogDataPretty) => {
output.unshift(log);
output = output.slice(0, 301);
});

let logger: FoxLogger;

process.on('uncaughtExceptionMonitor', (err, origin) => {
    const appError = new Error(`Uncaught exception is crashing the app! :( Type: ${origin}`, {cause: err});
    if(logger !== undefined) {
        logger.error(appError)
    } else {
        initLogger.error(appError);
    }
})

const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);

    try {
        initLogger.verbose(`Config Dir ENV: ${process.env.CONFIG_DIR} -> Resolved: ${configDir}`)
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

        initLogger.info(`Debug Mode: ${isDebugMode() ? 'YES' : 'NO'}`);

        await parseVersion();

        const [aLogger, appLoggerStream] = await appLogger(logging)
        logger = childLogger(aLogger, 'App');

        const root = getRoot({...config, logger, loggingConfig: logging, loggerStream: appLoggerStream});
        initLogger.info(`Version: ${root.get('version')}`);

        initLogger.info('Generating schema definitions...');
        createVegaGenerator()
        initLogger.info('Schema definitions generated');

        initServer(logger, appLoggerStream, output);

        if(process.env.IS_LOCAL === 'true') {
            logger.info('multi-scrobbler can be run as a background service! See: https://foxxmd.github.io/multi-scrobbler/docs/installation/service');
        }

        if(appConfigFail !== undefined) {
            logger.warn('App config file exists but could not be parsed!');
            logger.warn(appConfigFail);
        }

        const notifiers = root.get('notifiers');
        await notifiers.buildWebhooks(webhooks);

        /*
        * setup clients
        * */
        const scrobbleClients = root.get('clients') as ScrobbleClients;
        await scrobbleClients.buildClientsFromConfig(notifiers);
        /*
        * setup sources
        * */
        const scrobbleSources = root.get('sources') as ScrobbleSources;
        await scrobbleSources.buildSourcesFromConfig([]);

        // check ambiguous client/source types like this for now
        const lastfmSources = scrobbleSources.getByType('lastfm');
        const lastfmScrobbles = scrobbleClients.getByType('lastfm');

        const scrobblerNames = lastfmScrobbles.map(x => x.name);
        const nameColl = lastfmSources.filter(x => scrobblerNames.includes(x.name));
        if(nameColl.length > 0) {
            logger.warn(`Last.FM source and clients have same names [${nameColl.map(x => x.name).join(',')}] -- this may cause issues`);
        }

        const clientTask = createHeartbeatClientsTask(scrobbleClients, logger);
        clientTask.execute();
        try {
            await retry(() => {
                if(clientTask.isExecuting) {
                    throw new Error('Waiting')
                }
                return true;
            },{retries: scrobbleClients.clients.length + 1, retryIntervalMs: 2000});
        } catch (e) {
            logger.warn('Waited too long for clients to start! Moving ahead with sources init...');
        }
        scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
            minutes: 20,
            runImmediately: false
        }, clientTask, {id: 'clients_heart'}));

        const sourceTask = createHeartbeatSourcesTask(scrobbleSources, logger);
        scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
            minutes: 20,
            runImmediately: true
        }, sourceTask, {id: 'sources_heart'}));

        logger.info('Scheduler started.');

    } catch (e) {
        const appError = new Error('Exited with uncaught error', {cause: e});
        if(logger !== undefined) {
            logger.error(appError);
        } else {
            initLogger.error(appError);
        }
        process.exit(1);
    }
}());

