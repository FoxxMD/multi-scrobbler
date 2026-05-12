import { eq, and, lte, inArray } from "drizzle-orm";
import { DrizzleBaseRepository, DrizzleRepositoryOpts } from "./BaseRepository.js";
import { DbConcrete } from "../drizzleUtils.js";
import { QueueStateSelect } from "../drizzleTypes.js";
import { queueStates } from "../schema/schema.js";
import { CLIENT_DEAD_QUEUE } from "../../../../../core/Atomic.js";
export class DrizzleQueueRepository extends DrizzleBaseRepository<'queueStates'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'queueStates', 'Queue', opts);
    }

    public deadFailedToQueue = async (componentId: number, retries: number): Promise<void> => {
        await this.db.update(queueStates).set({
            queueStatus: 'queued',
        }).where(and(
            eq(queueStates.componentId, componentId),
            lte(queueStates.retries, retries),
            eq(queueStates.queueStatus, 'failed'),
            eq(queueStates.queueName, CLIENT_DEAD_QUEUE)
        ));
    }

    public failedQueueToCompleted = async (componentId: number): Promise<void> => {
        await this.db.update(queueStates).set({
            queueStatus: 'completed',
        }).where(and(
            eq(queueStates.componentId, componentId),
            eq(queueStates.queueStatus, 'queued'),
            eq(queueStates.queueName, CLIENT_DEAD_QUEUE)
        ));
    }

    public getQueueCount = async (componentId: number, queueNames: string[], queueStatus: QueueStateSelect['queueStatus'][] = ['queued']): Promise<number> => {
        return await this.db.$count(queueStates, and(
            eq(queueStates.componentId, componentId),
            inArray(queueStates.queueName, queueNames),
            inArray(queueStates.queueStatus, queueStatus)
        ));
    }
}