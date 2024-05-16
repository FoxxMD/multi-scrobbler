import { childLogger, Logger } from '@foxxmd/logging';
import { PromisePool } from "@supercharge/promise-pool";
import { AsyncTask } from "toad-scheduler";
import ScrobbleClients from "../scrobblers/ScrobbleClients.js";

export const createHeartbeatClientsTask = (clients: ScrobbleClients, parentLogger: Logger) => {
    const logger = childLogger(parentLogger, ['Heartbeat', 'Clients']);

    return new AsyncTask(
        'Heartbeat',
        (): Promise<any> => {
            logger.verbose('Starting check...');
            return PromisePool
                .withConcurrency(1)
                .for(clients.clients)
                .process(async (client) => {
                    const ready = client.isReady();
                    if(ready || client.canTryAuth()) {
                        if(!ready) {
                            client.logger.info('Trying client auth...');
                            await client.testAuth();
                            if(!client.authed) {
                                return 0;
                            }
                            if(!client.isReady()) {
                                return 0;
                            }
                        }
                        await client.processDeadLetterQueue();
                        if(!client.scrobbling) {
                            client.logger.info('Should be processing scrobbles! Attempting to restart scrobbling...', {leaf: 'Heartbeat'});
                            client.initScrobbleMonitoring();
                            return 1;
                        }
                        return 0;
                    }
                }).then(({results, errors}) => {
                    logger.verbose(`Checked Dead letter queue for ${clients.clients.length} clients.`);
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
