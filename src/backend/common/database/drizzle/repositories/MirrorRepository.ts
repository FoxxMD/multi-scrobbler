import { and, count, eq, gte, inArray, lte } from "drizzle-orm";
import dayjs from "dayjs";
import type { DbConcrete } from "../drizzleUtils.ts";
import { playMirrors, playsHistorical } from "../schema/schema.ts";
import { DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import { addRange, addSegment, removeRange, removeSegmentRange, subtractRanges, type TimeRange } from "../../../../utils/RangeUtils.ts";
import type { MirrorSegment } from "../../../../../core/Job.ts";

export type PlayMirrorSelect = typeof playMirrors.$inferSelect;

export interface FindOrCreateMirrorOpts {
    userId: string
    /** MIRROR_SERVICE_MIXED for user mirrors, else the service a locked mirror belongs to */
    service: string
    /** account of a locked mirror. null always creates a new mirror (user mirrors) */
    account: string | null
    name: string
}

/** What filled a range of coverage */
export type CoverageTag = Omit<MirrorSegment, 'range'>;

const UNKNOWN_TAG: CoverageTag = {origin: 'unknown', jobId: null};

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

    /** Number of mirror plays per mirror id */
    playCounts = async (ids: number[]): Promise<Map<number, number>> => {
        if(ids.length === 0) {
            return new Map();
        }
        const rows = await this.db.select({mirrorId: playsHistorical.mirrorId, count: count()}).from(playsHistorical).where(inArray(playsHistorical.mirrorId, ids)).groupBy(playsHistorical.mirrorId);
        return new Map(rows.map(x => [x.mirrorId as number, x.count]));
    }

    /** Number of a mirror's plays in an inclusive ms range */
    countInRange = async (id: number, range: TimeRange): Promise<number> => {
        const [row] = await this.db.select({count: count()}).from(playsHistorical).where(and(eq(playsHistorical.mirrorId, id), gte(playsHistorical.playedAt, dayjs(range[0])), lte(playsHistorical.playedAt, dayjs(range[1]))));
        return row?.count ?? 0;
    }

    /**
     * Merge range into coverage, and tag the parts that were not covered yet with what filled them.
     * Does not open a transaction, call inside one when paired with play inserts
     * */
    addCoverage = async (id: number, range: TimeRange, tag: CoverageTag = UNKNOWN_TAG): Promise<TimeRange[]> => {
        const mirror = await this.getById(id);
        if(mirror === undefined) {
            throw new Error(`Mirror ${id} does not exist`);
        }
        const coverage = addRange(mirror.coverage, range);
        const segments = addSegment(mirror.segments, range, tag);
        await this.updateById(id, {coverage, segments});
        return coverage;
    }

    /** Remove a range from coverage (and its segments), or all coverage when range is undefined */
    removeCoverage = async (id: number, range?: TimeRange): Promise<TimeRange[]> => {
        const mirror = await this.getById(id);
        if(mirror === undefined) {
            throw new Error(`Mirror ${id} does not exist`);
        }
        const coverage = range === undefined ? [] : removeRange(mirror.coverage, range);
        const segments = range === undefined ? [] : removeSegmentRange(mirror.segments, range);
        await this.updateById(id, {coverage, segments});
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
