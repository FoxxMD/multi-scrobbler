import { eq } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { type DbConcrete, runTransaction } from "../drizzleUtils.ts";
import { jobs, plays } from "../schema/schema.ts";
import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";

export type JobSelect = typeof jobs.$inferSelect;
export type JobNew = typeof jobs.$inferInsert;

export class JobRepository extends DrizzleBaseRepository<'jobs'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'jobs', 'Jobs', opts);
    }

    getById = async (id: number): Promise<JobSelect | undefined> => {
        return (await this.db.select().from(jobs).where(eq(jobs.id, id)))[0];
    }

    update = async (id: number, data: Partial<JobNew>): Promise<JobSelect | undefined> => {
        return (await this.db.update(jobs).set(data).where(eq(jobs.id, id)).returning())[0];
    }

    findForUser = async (userId: string): Promise<JobSelect[]> => {
        return this.db.select().from(jobs).where(eq(jobs.userId, userId));
    }

    findByIdForUser = async (id: number, userId: string): Promise<JobSelect | undefined> => {
        const job = await this.getById(id);
        return job?.userId === userId ? job : undefined;
    }

    /**
     * Unlinks (but keeps) client plays created by the job, deletes the job, then deletes the import file if it was uploaded through MS.
     * plays.jobId is ON DELETE CASCADE so it must be nulled first to keep client history.
     * */
    deleteJob = async (id: number): Promise<void> => {
        const job = await this.getById(id);
        if(job === undefined) {
            return;
        }
        await runTransaction(this.db, async () => {
            await this.db.update(plays).set({jobId: null}).where(eq(plays.jobId, id));
            await this.db.delete(jobs).where(eq(jobs.id, id));
        });
        if(job.importFile?.managed === true) {
            try {
                await rm(job.importFile.path, {force: true});
            } catch (e) {
                this.logger.warn(new Error(`Could not delete import file ${job.importFile.path} for deleted Job ${id}`, {cause: e}));
            }
        }
    }
}
