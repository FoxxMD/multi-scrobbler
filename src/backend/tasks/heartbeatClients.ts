import {config, Logger} from "@foxxmd/winston";
import {mergeArr} from "../utils";
import {AsyncTask} from "toad-scheduler";
import {PromisePool} from "@supercharge/promise-pool";
import ScrobbleClients from "../scrobblers/ScrobbleClients";

export const createHeartbeatClientsTask = (clients: ScrobbleClients, parentLogger: Logger) => {
    const logger = parentLogger.child({labels: ['Heartbeat', 'Clients']}, mergeArr);

    return new AsyncTask(
        'Heartbeat',
        (): Promise<any> => {
            return PromisePool
                .withConcurrency(1)
                .for(clients.clients)
                .process(async (client) => {
                    if(await client.isReady()) {
                        await client.processDeadLetterQueue();
                        if(!client.scrobbling) {
                            client.logger.info('Should be processing scrobbles! Attempting to restart scrobbling...', {leaf: 'Heartbeat'});
                            client.initScrobbleMonitoring();
                            return 1;
                        }
                        return 0;
                    }
                }).then(({results, errors}) => {
                    logger.info(`Checked Dead letter queue for ${clients.clients.length} clients.`);
                    const restarted = results.reduce((acc, curr) => acc += curr, 0);
                    if (restarted > 0) {
                        logger.info(`Attempted to restart ${restarted} clients that were not processing scrobbles.`);
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
