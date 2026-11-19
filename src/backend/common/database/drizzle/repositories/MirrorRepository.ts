import { and, eq } from "drizzle-orm";
import type { DbConcrete } from "../drizzleUtils.ts";
import { playMirrors } from "../schema/schema.ts";
import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import { addRange, subtractRanges, type TimeRange } from "../../../../utils/RangeUtils.ts";

export type PlayMirrorSelect = typeof playMirrors.$inferSelect;

export interface FindOrCreateMirrorOpts {
    userId: string
    service: string
    /** upstream username. null always creates a new, isolated mirror */
    account: string | null
    name: string
}

export class MirrorRepository extends DrizzleBaseRepository<'playMirrors'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'playMirrors', 'Play Mirrors', opts);
    }

    findOrCreate = async (opts: FindOrCreateMirrorOpts): Promise<PlayMirrorSelect> => {
        const {userId, service, account, name} = opts;
        if(account === null) {
            return (await this.db.insert(playMirrors).values({userId, service, account, name}).returning())[0];
        }
        // conflict => created concurrently or already exists, either way select it
        await this.db.insert(playMirrors).values({userId, service, account, name}).onConflictDoNothing();
        return (await this.db.select().from(playMirrors).where(and(eq(playMirrors.userId, userId), eq(playMirrors.service, service), eq(playMirrors.account, account))))[0];
    }

    getById = async (id: number): Promise<PlayMirrorSelect | undefined> => {
        return (await this.db.select().from(playMirrors).where(eq(playMirrors.id, id)))[0];
    }

    findForUser = async (userId: string): Promise<PlayMirrorSelect[]> => {
        return this.db.select().from(playMirrors).where(eq(playMirrors.userId, userId));
    }

    /** Merge range into coverage. Does not open a transaction, call inside one when paired with play inserts */
    addCoverage = async (id: number, range: TimeRange): Promise<TimeRange[]> => {
        const mirror = await this.getById(id);
        if(mirror === undefined) {
            throw new Error(`Mirror ${id} does not exist`);
        }
        const coverage = addRange(mirror.coverage, range);
        await this.updateById(id, {coverage});
        return coverage;
    }

    getGaps = async (id: number, range: TimeRange): Promise<TimeRange[]> => {
        const mirror = await this.getById(id);
        if(mirror === undefined) {
            throw new Error(`Mirror ${id} does not exist`);
        }
        return subtractRanges(range, mirror.coverage);
    }
}
