import { eq, and, lte, inArray } from "drizzle-orm";
import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import type {DbConcrete} from "../drizzleUtils.ts";
import type {PlaySelect, QueueStateSelect} from "../drizzleTypes.ts";
import { playEvents, queueStates } from "../schema/schema.ts";
import { DEAD_QUEUE } from "../../../../../core/Atomic.ts";
import { queueStateToPlayEvent } from "../entityUtils.ts";
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
            eq(queueStates.queueName, DEAD_QUEUE)
        ));
    }

    public failedQueueToCompleted = async (componentId: number): Promise<void> => {
        await this.db.update(queueStates).set({
            queueStatus: 'completed',
        }).where(and(
            eq(queueStates.componentId, componentId),
            eq(queueStates.queueStatus, 'queued'),
            eq(queueStates.queueName, DEAD_QUEUE)
        ));
    }

    public getQueueCount = async (componentId: number, queueNames: string[], queueStatus: QueueStateSelect['queueStatus'][] = ['queued']): Promise<number> => {
        return await this.db.$count(queueStates, and(
            eq(queueStates.componentId, componentId),
            inArray(queueStates.queueName, queueNames),
            inArray(queueStates.queueStatus, queueStatus)
        ));
    }

    async create(data: typeof this.table.$inferInsert & {playId?: PlaySelect['id']}): Promise<typeof this.table.$inferSelect> {
        const res = await super.create(data) as QueueStateSelect;
        if(data.playId !== undefined) {
            try {
                await this.db.insert(playEvents).values({...queueStateToPlayEvent(res), playId: data.playId});
            } catch (e) {
                this.logger.warn(new Error(`Failed to create Play Event for new queue creation on Play ${data.playId}`));
            }
        }
        return res;
    }

    async updateById(id: number, data: Partial<typeof this.table.$inferInsert> & {playId?: PlaySelect['id']}): Promise<typeof this.table.$inferSelect> {
        const res = await super.updateById(id, data) as QueueStateSelect;
        if(data.playId !== undefined) {
            try {
                await this.db.insert(playEvents).values({...queueStateToPlayEvent(res), playId: data.playId});
            } catch (e) {
                this.logger.warn(new Error(`Failed to create Play Event for queue ${res.queueName} on Play ${data.playId}`));
            }
        }
        return res;
    }
}