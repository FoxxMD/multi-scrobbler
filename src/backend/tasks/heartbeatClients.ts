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
                    if(!client.isReady()) {
                        if(!client.canAuthUnattended()) {
                            client.logger.warn({labels: 'Heartbeat'}, 'Client is not ready but will not try to initialize because auth state is not good and cannot be correct unattended.')
                            return 0;
                        }
                        try {
                            await client.tryInitialize({force: false, notify: true, notifyTitle: 'Could not initialize automatically'});
                        } catch (e) {
                            client.logger.error(new Error('Could not initialize automatically', {cause: e}));
                            return 1;
                        }
                    }

                    if(!client.canAuthUnattended()) {
                        client.logger.warn({label: 'Heartbeat'}, 'Should be monitoring scrobbles but will not attempt to start because auth state is not good and cannot be correct unattended.');
                        return 0;
                    }

                    await client.processDeadLetterQueue();
                    if(!client.scrobbling) {
                        client.logger.info({labels: 'Heartbeat'}, 'Should be processing scrobbles! Attempting to restart scrobbling...');
                        client.initScrobbleMonitoring();
                        return 1;
                    }
                }).then(({results, errors}) => {
                    logger.verbose(`Checked Dead letter queue for ${clients.clients.length} clients.`);
                    const restarted = results.reduce((acc, curr) => acc += curr, 0);
                    if (restarted > 0) {
                        logger.info(`Attempted to start ${restarted} clients that were not processing scrobbles.`);
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
