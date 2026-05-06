import 'dotenv/config';
import { childLogger, LogDataPretty, Logger as FoxLogger } from "@foxxmd/logging";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import isToday from 'dayjs/plugin/isToday.js';
import timezone from 'dayjs/plugin/timezone.js';
import week from 'dayjs/plugin/weekOfYear.js';
import utc from 'dayjs/plugin/utc.js';
import * as path from "path";
import { SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { projectDir } from "./common/index.js";
import { AIOConfig } from "./common/infrastructure/config/aioConfig.js";
import { appLogger, initLogger as getInitLogger } from "./common/logging.js";
import { getRoot } from "./ioc.js";
import { parseVersion } from "./version.js";
import { initServer } from "./server/index.js";
import { isDebugMode, parseBool, retry, sleep } from "./utils.js";
import { readJson } from './utils/DataUtils.js';
import ScrobbleClients from './scrobblers/ScrobbleClients.js';
import ScrobbleSources from './sources/ScrobbleSources.js';
import { Notifiers } from './notifier/Notifiers.js';
import { getDb, performDbMigrationWithBackup } from './common/database/drizzle/drizzleUtils.js';
import { getDbPath } from './common/database/Database.js';
import { createRetentionCleanupTask } from './tasks/retentionCleanup.js';

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);
dayjs.extend(week);

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
            config = await readJson(`${configDir}/config.json`, {throwOnNotFound: false, logger: childLogger(initLogger, 'Secrets')});
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

        const version = await parseVersion();

        initLogger.info(`Version: ${version}`);

        const [aLogger, appLoggerStream] = await appLogger(logging)
        logger = childLogger(aLogger, 'App');
        
        logger.info(`Using database at ${getDbPath('ms')}`);
        await performDbMigrationWithBackup('ms', {logger});

        const root = getRoot({
            ...config,
            logger,
            loggingConfig: logging,
            loggerStream: appLoggerStream,
            db: getDb('ms', {logger})
        });

        const internalConfigOptional = {
             localUrl: root.get('localUrl'),
            configDir: root.get('configDir'),
             version: root.get('version')
             };

        const scrobbleClients = new ScrobbleClients(root.get('clientEmitter'), root.get('sourceEmitter'), internalConfigOptional, root.get('logger'));
        const scrobbleSources = new ScrobbleSources(root.get('sourceEmitter'), internalConfigOptional, root.get('logger'));

        await root.items.cache().init(true);

        initServer(logger, appLoggerStream, output, scrobbleSources, scrobbleClients);

        if(process.env.IS_LOCAL === 'true') {
            logger.info('multi-scrobbler can be run as a background service! See: https://docs.multi-scrobbler.app/installation/service');
        }

        if(appConfigFail !== undefined) {
            logger.warn('App config file exists but could not be parsed!');
            logger.warn(appConfigFail);
        }

        const notifiers = new Notifiers(root.get('notifierEmitter'), root.get('clientEmitter'), root.get('sourceEmitter'), root.get('logger')); //root.get('notifiers');
        await notifiers.buildWebhooks(webhooks);

        await root.items.transformerManager.registerFromEnv();
        await root.items.transformerManager.registeryDefaults();
        await root.items.transformerManager.initTransformers();

        /*
        * setup clients
        * */
        await scrobbleClients.buildClientsFromConfig(notifiers);
        /*
        * setup sources
        * */
        await scrobbleSources.buildSourcesFromConfig([]);

        // check ambiguous client/source types like this for now
        const lastfmSources = scrobbleSources.getByType('lastfm');
        const lastfmScrobbles = scrobbleClients.getByType('lastfm');

        const scrobblerNames = lastfmScrobbles.map(x => x.name);
        const nameColl = lastfmSources.filter(x => scrobblerNames.includes(x.name));
        if(nameColl.length > 0) {
            logger.warn(`Last.FM source and clients have same names [${nameColl.map(x => x.name).join(',')}] -- this may cause issues`);
        }

        for(const c of scrobbleClients.clients) {
            c.initTasks();
            const res = await Promise.race([
                sleep(2200),
                (async () => {
                    while(!c.isReady()) {
                        await sleep(400)
                    }
                    return true;
                })()
            ]);
            if(res === undefined) {
                logger.debug(`Not waiting for Client ${c.name} to finish init, moving on to the next Client...`);
            }
        }

        for(const c of scrobbleSources.sources) {
            c.initTasks();
            const res = await Promise.race([
                sleep(2200),
                (async () => {
                    while(!c.isReady()) {
                        await sleep(400)
                    }
                    return true;
                })()
            ]);
            if(res === undefined) {
                logger.debug(`Not waiting for Source ${c.name} to finish init, moving on to the next Source...`);
            }
        }

        let runRetentionNow = parseBool(process.env.RETENTION_IMMEDIATE, false);

        const retentionTask = createRetentionCleanupTask(scrobbleSources, scrobbleClients, logger);
        let retentionJobAdded = false;
        const addJob = () => { 
            retentionJobAdded = true;
            scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
                minutes: 60,
                runImmediately: runRetentionNow
            }, retentionTask, {id: 'retention', preventOverrun: true}));
            logger.debug('Added Retention Cleanup task to scheduler');
        };
        logger.debug('Added Client Heartbeat task to scheduler');

        if(runRetentionNow === false || (scrobbleClients.clients.every(x => x.isReady()) && scrobbleSources.sources.every(x => x.isReady()))) {
            addJob();
        }

        logger.info('Scheduler started.');

        if(runRetentionNow === true && !retentionJobAdded) {
            logger.info('Detected that Retention Cleanup should run immediately but all sources/clients have not started yet! Delaying retention cleanup by 1 minute to allow all sources/clients to finish starting.');
            await sleep(60 * 1000);
            addJob();
        }


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

