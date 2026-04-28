import { Logger, eq, and, lte, inArray } from "drizzle-orm";
import { DrizzleBaseRepository, DrizzleRepositoryOpts } from "./BaseRepository.js";
import { getDb } from "../drizzleUtils.js";
import { ComponentNew, ComponentSelect, FindWhere, QueueStateSelect } from "../drizzleTypes.js";
import { components, queueStates } from "../schema/schema.js";
import { generateComponentEntity } from "../entityUtils.js";
import { CLIENT_DEAD_QUEUE } from "../../../../../core/Atomic.js";

export class DrizzleQueueRepository extends DrizzleBaseRepository<'queueStates'> {

    constructor(db: ReturnType<typeof getDb>, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'queueStates', 'Queue', opts);
    }

    public deadFailedToQueue = async (componentId: number, retries: number): Promise<void> => {
        await this.db.update(queueStates).set({
            queueStatus: 'queued',
            queueName: CLIENT_DEAD_QUEUE
        }).where(and(
            eq(queueStates.componentId, componentId),
            lte(queueStates.retries, retries)
        ));
    }

    public failedQueueToCompleted = async (componentId: number): Promise<void> => {
        await this.db.update(queueStates).set({
            queueStatus: 'completed',
            queueName: CLIENT_DEAD_QUEUE
        }).where(and(
            eq(queueStates.componentId, componentId),
            eq(queueStates.queueStatus, 'queued')
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