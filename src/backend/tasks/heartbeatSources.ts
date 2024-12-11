import { childLogger, Logger } from '@foxxmd/logging';
import { PromisePool } from "@supercharge/promise-pool";
import { AsyncTask } from "toad-scheduler";
import { ChromecastSource } from "../sources/ChromecastSource.js";
import ScrobbleSources from "../sources/ScrobbleSources.js";

export const createHeartbeatSourcesTask = (sources: ScrobbleSources, parentLogger: Logger) => {
    const logger = childLogger(parentLogger, ['Heartbeat', 'Sources']);

    return new AsyncTask(
        'Heartbeat',
        (): Promise<any> => {
            logger.verbose('Starting check...');
            return PromisePool
                .withConcurrency(1)
                .for(sources.sources)
                .process(async (source) => {
                    if(!source.isReady()) {
                        if(!source.canAuthUnattended()) {
                            source.logger.warn({label: 'Heartbeat'}, 'Source is not ready but will not try to initialize because auth state is not good and cannot be correct unattended.');
                            return 0;
                        }
                        try {
                            await source.tryInitialize({force: false, notify: true, notifyTitle: 'Could not initialize automatically'});
                        } catch (e) {
                            source.logger.error(new Error('Could not initialize source automatically', {cause: e}));
                            return 1;
                        }
                    }

                    if(source.type === 'chromecast') {
                        (source as ChromecastSource).discoverDevices();
                    }

                    if (source.canPoll && !source.polling) {
                        if(!source.canAuthUnattended()) {
                            source.logger.warn({label: 'Heartbeat'}, 'Should be polling but will not attempt to start because auth state is not good and cannot be correct unattended.');
                            return 0;
                        } else {
                            source.logger.info({label: 'Heartbeat'}, 'Should be polling, attempting to start polling...');
                            source.poll({force: false, notify: true}).catch(e => source.logger.error(e));
                        }
                        return 1;
                    }

                    return 0;
                }).then(({results, errors}) => {
                    logger.verbose(`Checked ${sources.sources.length} sources for start signals.`);
                    const restarted = results.reduce((acc, curr) => acc += curr, 0);
                    if (restarted > 0) {
                        logger.info(`Attempted to start ${restarted} sources.`);
                    }
                    if (errors.length > 0) {
                        logger.error(`Encountered errors!`);
                        for (const err of errors) {
                            logger.error(err);
                        }
                    }
                });
        },
        (err: Error) => {
            logger.error(err);
        }
    );
}
