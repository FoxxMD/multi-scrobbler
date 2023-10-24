import {config, Logger} from "@foxxmd/winston";
import {mergeArr} from "../utils";
import {AsyncTask} from "toad-scheduler";
import {PromisePool} from "@supercharge/promise-pool";
import ScrobbleSources from "../sources/ScrobbleSources";

export const createHeartbeatSourcesTask = (sources: ScrobbleSources, parentLogger: Logger) => {
    const logger = parentLogger.child({labels: ['Heartbeat', 'Sources']}, mergeArr);

    return new AsyncTask(
        'Heartbeat',
        (): Promise<any> => {
            return PromisePool
                .withConcurrency(1)
                .for(sources.sources)
                .process(async (source) => {
                    if (source.initialized && source.canPoll && !source.polling && !source.authGated()) {
                        source.logger.info('Should be polling! Attempting to restart polling...', {leaf: 'Heartbeat'});
                        source.poll();
                        return 1;
                    }
                    return 0;
                }).then(({results, errors}) => {
                    logger.verbose(`Checked ${sources.sources.length} sources for restart signals.`);
                    const restarted = results.reduce((acc, curr) => acc += curr, 0);
                    if (restarted > 0) {
                        logger.info(`Attempted to restart ${restarted} sources that were not polling.`);
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
