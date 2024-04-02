import 'dotenv/config';
import { childLogger, LogDataPretty, Logger as FoxLogger } from "@foxxmd/logging";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import * as path from "path";
import { SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { projectDir } from "./common/index.js";
import { AIOConfig } from "./common/infrastructure/config/aioConfig.js";
import { appLogger, initLogger as getInitLogger } from "./common/logging.js";
import { getRoot } from "./ioc.js";
import { initServer } from "./server/index.js";
import { createHeartbeatClientsTask } from "./tasks/heartbeatClients.js";
import { createHeartbeatSourcesTask } from "./tasks/heartbeatSources.js";
import { parseBool, readJson, sleep } from "./utils.js";

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);

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

        const [aLogger, appLoggerStream] = await appLogger(logging)
        logger = childLogger(aLogger, 'App');

        const root = getRoot({...config, logger});
        initLogger.info(`Version: ${root.get('version')}`);

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
        const scrobbleClients = root.get('clients');
        await scrobbleClients.buildClientsFromConfig(notifiers);
        if (scrobbleClients.clients.length === 0) {
            logger.warn('No scrobble clients were configured!')
        } else {
            logger.info('Starting scrobble clients...');
        }
        for(const client of scrobbleClients.clients) {
            await client.initScrobbleMonitoring();
        }

        const scrobbleSources = root.get('sources');//new ScrobbleSources(localUrl, configDir);
        await scrobbleSources.buildSourcesFromConfig([]);

        // check ambiguous client/source types like this for now
        const lastfmSources = scrobbleSources.getByType('lastfm');
        const lastfmScrobbles = scrobbleClients.getByType('lastfm');

        const scrobblerNames = lastfmScrobbles.map(x => x.name);
        const nameColl = lastfmSources.filter(x => scrobblerNames.includes(x.name));
        if(nameColl.length > 0) {
            logger.warn(`Last.FM source and clients have same names [${nameColl.map(x => x.name).join(',')}] -- this may cause issues`);
        }

        let anyNotReady = false;
        for (const source of scrobbleSources.sources.filter(x => x.canPoll === true)) {
            await sleep(1500); // stagger polling by 1.5 seconds so that log messages for each source don't get mixed up
            if(source.isReady()) {
                source.poll();
            } else {
                anyNotReady = true;
            }
        }
        if (anyNotReady) {
            logger.info(`Some sources are not ready, open the dashboard to continue`);
        }

        scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
            minutes: 20,
            runImmediately: false
        }, createHeartbeatSourcesTask(scrobbleSources, logger)));
        scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
            minutes: 20,
            runImmediately: false
        }, createHeartbeatClientsTask(scrobbleClients, logger)));
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

