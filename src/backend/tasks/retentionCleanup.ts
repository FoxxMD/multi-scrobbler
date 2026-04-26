import { childLogger, Logger } from '@foxxmd/logging';
import { AsyncTask } from "toad-scheduler";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import ScrobbleClients from '../scrobblers/ScrobbleClients.js';

export const createRetentionCleanupTask = (sources: ScrobbleSources, clients: ScrobbleClients, parentLogger: Logger) => {
    const logger = childLogger(parentLogger, ['Schedule', 'Retention Cleanup']);

    return new AsyncTask(
        'Retention',
        (): Promise<any> => {
            return retentionTask(sources, clients, logger).then(() => null).catch((err) => {
                logger.error(err);
            });
        },
        (err: Error) => {
            logger.error(err);
        }
    );
}

const retentionTask = async (sources: ScrobbleSources, clients: ScrobbleClients, logger: Logger): Promise<void> => {
    // todo may want to implement abort controllers for these in case they don't finish

    logger.verbose('Starting client cleanup...');
    const validClients = clients.clients.filter(x => x.databaseOK);
    const invalidClients = clients.clients.filter(x => x.databaseOK !== true);
    if(invalidClients.length > 0) {
       logger.debug(`Not running cleanup for ${invalidClients.length} clients because their database state is not OK: ${invalidClients.map(x => x.getSafeExternalName()).join(',')}`);
    }    
    const clientCleanupPromises = validClients.map(x => x.retentionCleanup().catch((err) => x.logger.warn(new Error('Failed to catch retention cleanup error!', {cause: err}))));
    await Promise.all(clientCleanupPromises);
    logger.verbose('Client cleanup done!');

    logger.verbose('Starting source cleanup...');
    const validSources = sources.sources.filter(x => x.databaseOK);
    const invalidSources= sources.sources.filter(x => x.databaseOK !== true);
    if(invalidClients.length > 0) {
       logger.debug(`Not running cleanup for ${invalidSources.length} sources because their database state is not OK: ${invalidSources.map(x => x.getSafeExternalName()).join(',')}`);
    }    
    const sourceCleanupPromises = validSources.map(x => x.retentionCleanup().catch((err) => x.logger.warn(new Error('Failed to catch retention cleanup error!', {cause: err}))));
    await Promise.all(sourceCleanupPromises);
    logger.verbose('Source cleanup done!');
}