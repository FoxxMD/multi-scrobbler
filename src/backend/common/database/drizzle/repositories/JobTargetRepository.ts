import { and, count, eq, inArray } from "drizzle-orm";
import type { JobTargetStats } from "../../../infrastructure/Job.ts";
import type { DbConcrete } from "../drizzleUtils.ts";
import { jobTargets, plays } from "../schema/schema.ts";
import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";

export type JobTargetSelect = typeof jobTargets.$inferSelect;
export type JobTargetNew = typeof jobTargets.$inferInsert;

export class JobTargetRepository extends DrizzleBaseRepository<'jobTargets'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'jobTargets', 'Job Targets', opts);
    }

    createForJob = async (jobId: number, componentIds: number[]): Promise<JobTargetSelect[]> => {
        if (componentIds.length === 0) {
            return [];
        }
        return this.db.insert(jobTargets).values(componentIds.map(componentId => ({jobId, componentId}))).returning();
    }

    getById = async (id: number): Promise<JobTargetSelect | undefined> => {
        return (await this.db.select().from(jobTargets).where(eq(jobTargets.id, id)))[0];
    }

    findByJob = async (jobId: number): Promise<JobTargetSelect[]> => {
        return this.db.select().from(jobTargets).where(eq(jobTargets.jobId, jobId)).orderBy(jobTargets.id);
    }

    findByJobs = async (jobIds: number[]): Promise<JobTargetSelect[]> => {
        if (jobIds.length === 0) {
            return [];
        }
        return this.db.select().from(jobTargets).where(inArray(jobTargets.jobId, jobIds)).orderBy(jobTargets.id);
    }

    findByComponent = async (componentId: number): Promise<JobTargetSelect[]> => {
        return this.db.select().from(jobTargets).where(eq(jobTargets.componentId, componentId));
    }

    findRunning = async (): Promise<JobTargetSelect[]> => {
        return this.db.select().from(jobTargets).where(eq(jobTargets.status, 'running'));
    }

    update = async (id: number, data: Partial<JobTargetNew>): Promise<JobTargetSelect | undefined> => {
        return (await this.db.update(jobTargets).set(data).where(eq(jobTargets.id, id)).returning())[0];
    }

    /** Number of the job's client plays per state, for one target client or every client (keyed by component id) */
    playStats = async (jobId: number, componentId?: number): Promise<Map<number, JobTargetStats>> => {
        const where = componentId === undefined ? eq(plays.jobId, jobId) : and(eq(plays.jobId, jobId), eq(plays.componentId, componentId));
        const rows = await this.db.select({componentId: plays.componentId, state: plays.state, count: count()}).from(plays).where(where).groupBy(plays.componentId, plays.state);
        const stats = new Map<number, JobTargetStats>();
        for (const r of rows) {
            if (r.componentId === null) {
                continue;
            }
            const s = stats.get(r.componentId) ?? {};
            s[r.state] = r.count;
            stats.set(r.componentId, s);
        }
        return stats;
    }
}
