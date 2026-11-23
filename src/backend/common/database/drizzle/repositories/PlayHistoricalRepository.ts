import { type DbConcrete, runTransaction } from "../drizzleUtils.ts";
import { TA_DEFAULT_ACCURACY, type TemporalAccuracy } from "../../../../../core/Atomic.ts";
import type { PlayObject } from "../../../../../core/PlaySchema.ts";
import { generateInputEntity, generatePlayHistoricalEntity, hydratePlaySelect, type PlayHydateOptions, type PlayHistoricalEntityOpts } from "../entityUtils.ts";
import { historicalPlayInputs, playsHistorical } from "../schema/schema.ts";
import type {FindWhere, FindMany, WhereClause, PlayHistoricalSelect, PlayHistoricalNew, HistoricalPlayInputNew, HistoricalPlayInputSelect} from "../drizzleTypes.ts";
import type { MarkOptional } from "ts-essentials";
import { removeUndefinedKeys } from '../../../../../core/DataUtils.ts';
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import dayjs from "dayjs";
import { EmptyFilter } from "drizzle-orm/relations";
import { buildDateCompare, type ComponentConstrainedRepoOpts, DrizzleBaseRepository, type DrizzleRepositoryOpts } from "./BaseRepository.ts";
import type { CompareDateOp } from "../../../../../core/Api.ts";
import type {PaginatedResponse} from "../../../../../core/Api.ts";
import { hashObject } from "../../../../utils/StringUtils.ts";
import { playContentBasicInvariantTransform, playMbidIdentifier } from "../../../../utils/PlayComparisonUtils.ts";
import { comparePlayTemporally, hasAcceptableTemporalAccuracy } from "../../../../utils/TimeUtils.ts";
import { getTemporallyCloseDateCompareOp } from "./PlayRepository.ts";

// https://github.com/drizzle-team/drizzle-orm/issues/695 may be useful for typing models with relations?

export interface PlayWhereOpts {
    componentId?: number
    mirrorId?: number
    seenAt?: CompareDateOp
    playedAt?: CompareDateOp
    uid?: string[]
}

export interface QueryPlaysOpts extends PlayWhereOpts {
    sort?: 'seenAt' | 'playedAt'
    order?: 'asc' | 'desc'
    limit?: number
    offset?: number
}

export interface HydrateOpts {
   hydrate?: PlayHydateOptions[] 
}

export interface WithInputOpts {
    /** include historical_play_inputs row as `input` */
    withInput?: boolean
}

export type PlayHistoricalSelectMaybeInput = PlayHistoricalSelect & { input?: HistoricalPlayInputSelect | null };

export type RepositoryCreatePlayHistoricalOpts = PlayHistoricalEntityOpts
    & Pick<PlayHistoricalNew, 'play' | 'componentId'>
    & {
        /** raw upstream data. When undefined no input row is created */
        input?: Partial<Pick<HistoricalPlayInputNew, 'play' | 'data'>>
    };

type PlayIdentifierPrimitiveMap = {
  uid: string;
  id: number;
};

const identifierExtractor: { [K in keyof PlayIdentifierPrimitiveMap]: (play: {id: number, uid: string}) => PlayIdentifierPrimitiveMap[K] } = {
  id: (play) => play.id,
  uid: (play) => play.uid,
};
export class DrizzlePlayHistoricalRepository extends DrizzleBaseRepository<'playsHistorical'> {

    constructor(db: DbConcrete, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'playsHistorical', 'Plays Historical', opts);
    }

    findByUid = async (uid: string, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelect | undefined> => {
        const res = await this.db.query.playsHistorical.findFirst({
            where: {
                uid,
                componentId: opts.componentId ?? this.componentId ?? EmptyFilter
            }
        });
        if(res === undefined) {
            return res;
        }
        res.play = hydratePlaySelect(res, opts.hydrate);
        return res;
    }

    hasByUid = async (uid: string, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<boolean> => {
        const res = await this.db.query.playsHistorical.findFirst({
            columns: {id: true},
            where: {
                uid,
                componentId: opts.componentId ?? this.componentId ?? EmptyFilter
            }
        });
        return res !== undefined;
    }

    createPlays = async (entitiesOpts: RepositoryCreatePlayHistoricalOpts[], opts: HydrateOpts = {}) => {

        const {
            hydrate
        } = opts;
        let playRows!: PlayHistoricalSelect[];

        await runTransaction(this.db, async () => {

            const entitiesData = entitiesOpts.map((data) => {
                const {
                    play,
                    input,
                    ...rest
                } = data;
                return generatePlayHistoricalEntity(play, { componentId: this.componentId, ...rest });
            });

            playRows = await this.db.insert(playsHistorical).values(entitiesData).returning();

            const inputDatas = playRows.flatMap((x, index) => {
                const {play, input} = entitiesOpts[index];
                if(input === undefined) {
                    return [];
                }
                const {play: inputPlay = play, ...restInput} = input;
                return [generateInputEntity({ play: inputPlay, playId: x.id, ...restInput }) as HistoricalPlayInputNew];
            });
            if(inputDatas.length > 0) {
                await this.db.insert(historicalPlayInputs).values(inputDatas);
            }
        });

        return playRows.map(x => ({...x, play: hydratePlaySelect(x, hydrate)}));
    }

    /**
     * Insert mirror plays, skipping any whose uid already exists. Returns the number of rows actually inserted.
     *
     * Every row must have a uid (dedupe key). Inputs are only created for inserted rows, matched by uid.
     *
     * Does not open a transaction so it can be paired with coverage/cursor updates in the caller's transaction.
     * */
    insertIgnoreDuplicates = async (entitiesOpts: (RepositoryCreatePlayHistoricalOpts & {uid: string})[], opts: {persistInputs?: boolean} = {}): Promise<number> => {
        const {persistInputs = true} = opts;
        if(entitiesOpts.length === 0) {
            return 0;
        }
        // raw data only belongs in historical_play_inputs
        const entitiesData = entitiesOpts.map(({play: {original, ...play}, input, ...rest}) => generatePlayHistoricalEntity(play, { componentId: this.componentId, ...rest }));
        const inserted = await this.db.insert(playsHistorical).values(entitiesData).onConflictDoNothing().returning({id: playsHistorical.id, uid: playsHistorical.uid});

        if(persistInputs && inserted.length > 0) {
            // first wins, matching which duplicate SQLite actually inserted
            const byUid = new Map<string, typeof entitiesOpts[number]>();
            for(const x of entitiesOpts) {
                if(!byUid.has(x.uid)) {
                    byUid.set(x.uid, x);
                }
            }
            const inputDatas = inserted.flatMap((x) => {
                const entity = byUid.get(x.uid as string);
                if(entity?.input === undefined) {
                    return [];
                }
                const {play: inputPlay = entity.play, ...restInput} = entity.input;
                return [generateInputEntity({ play: inputPlay, playId: x.id, ...restInput }) as HistoricalPlayInputNew];
            });
            if(inputDatas.length > 0) {
                await this.db.insert(historicalPlayInputs).values(inputDatas);
            }
        }
        return inserted.length;
    }

    findPlays = async (args: QueryPlaysOpts, opts: HydrateOpts & WithInputOpts & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelectMaybeInput[]> => {
        const {
            hydrate,
            withInput = false,
            componentId = this.componentId
        } = opts;
        // this does not work as type for query variable
        // it erases the result type for some reason
        //
        // Parameters<typeof this.db.query.plays.findMany>[0]
        
        // this does work but it is also integrated into FindWith
        //let withQuery: Parameters<typeof this.db.query.plays.findMany>[0]['with'] = undefined;

        let query: FindMany<'playsHistorical'> = {
            limit: args.limit,
            offset: args.offset
        };

        query.where = buildPlayHistoricalWhere({componentId: componentId,  ...args});

        if (args.sort !== undefined) {
            query.orderBy = {
                [args.sort]: args.order ?? 'desc'
            }
        } else {
            query.orderBy = {
                id: 'asc'
            }
        }

        query = removeUndefinedKeys(query, false);
        if(withInput) {
            query.with = {input: true};
        }
        const results = await this.db.query.playsHistorical.findMany(query) as PlayHistoricalSelectMaybeInput[];
        return results.map((x) => ({...x, play: hydratePlaySelect(x, hydrate)}));
    }

    /**
     * A page of a mirror's plays in `range` (inclusive, ms), in export order, after the keyset `after` (the last row of the previous page).
     * Plays are hydrated without id/uid.
     * */
    findPageForExport = async (args: {mirrorId: number, range: [number, number], order: 'asc' | 'desc', after?: {playedAt: number, id: number}, limit: number}): Promise<{id: number, playedAt: number, play: PlayObject}[]> => {
        const {mirrorId, range, order, after, limit} = args;
        const t = playsHistorical;
        const conditions = [eq(t.mirrorId, mirrorId), gte(t.playedAt, dayjs(range[0])), lte(t.playedAt, dayjs(range[1]))];
        if (after !== undefined) {
            const beyond = order === 'desc' ? lt : gt;
            conditions.push(or(beyond(t.playedAt, dayjs(after.playedAt)), and(eq(t.playedAt, dayjs(after.playedAt)), beyond(t.id, after.id)))!);
        }
        const dir = order === 'desc' ? desc : asc;
        const rows = await this.db.select().from(t).where(and(...conditions)).orderBy(dir(t.playedAt), dir(t.id)).limit(limit);
        return rows.map(x => ({id: x.id, playedAt: x.playedAt!.valueOf(), play: hydratePlaySelect(x, [])}));
    }

    /**
     * Up to `limit` ids of a mirror's plays, optionally only in `range` (inclusive, ms) and only those not compacted yet.
     * Ordered by id so batched cleanups make steady progress.
     * */
    findMirrorIds = async (args: {mirrorId: number, range?: [number, number], uncompacted?: boolean, limit: number}): Promise<number[]> => {
        const {mirrorId, range, uncompacted = false, limit} = args;
        const t = playsHistorical;
        const conditions = [eq(t.mirrorId, mirrorId)];
        if (range !== undefined) {
            conditions.push(gte(t.playedAt, dayjs(range[0])), lte(t.playedAt, dayjs(range[1])));
        }
        if (uncompacted) {
            conditions.push(isNull(t.compacted));
        }
        const rows = await this.db.select({id: t.id}).from(t).where(and(...conditions)).orderBy(asc(t.id)).limit(limit);
        return rows.map(x => x.id);
    }

    /** Number of a mirror's plays, optionally only in `range` (inclusive, ms) and only those not compacted yet */
    countMirror = async (args: {mirrorId: number, range?: [number, number], uncompacted?: boolean}): Promise<number> => {
        const {mirrorId, range, uncompacted = false} = args;
        const t = playsHistorical;
        const conditions = [eq(t.mirrorId, mirrorId)];
        if (range !== undefined) {
            conditions.push(gte(t.playedAt, dayjs(range[0])), lte(t.playedAt, dayjs(range[1])));
        }
        if (uncompacted) {
            conditions.push(isNull(t.compacted));
        }
        const [row] = await this.db.select({count: count()}).from(t).where(and(...conditions));
        return row?.count ?? 0;
    }

    /** Replace raw upstream data of these plays with a removal note */
    compactInputs = async (ids: number[]): Promise<void> => {
        if (ids.length === 0) {
            return;
        }
        await runTransaction(this.db, async () => {
            await this.db.update(historicalPlayInputs).set({data: {removedReason: 'Removed by compaction'}}).where(inArray(historicalPlayInputs.playId, ids));
            await this.db.update(playsHistorical).set({compacted: 'input'}).where(inArray(playsHistorical.id, ids));
        });
    }

    /** Move a component's plays that have no mirror into mirrorId, in batches. Returns how many moved */
    assignComponentToMirror = async (componentId: number, mirrorId: number, origin: string, batchSize: number = 5000): Promise<number> => {
        const t = playsHistorical;
        let moved = 0;
        while (true) {
            const ids = (await this.db.select({id: t.id}).from(t).where(and(eq(t.componentId, componentId), isNull(t.mirrorId))).limit(batchSize)).map(x => x.id);
            if (ids.length === 0) {
                return moved;
            }
            await this.db.update(t).set({mirrorId, origin}).where(inArray(t.id, ids));
            moved += ids.length;
        }
    }

    /** Delete a component's plays that are in a mirror other than mirrorId. Returns how many were deleted */
    deleteComponentOutsideMirror = async (componentId: number, mirrorId: number): Promise<number> => {
        const t = playsHistorical;
        const deleted = await this.db.delete(t).where(and(eq(t.componentId, componentId), isNotNull(t.mirrorId), ne(t.mirrorId, mirrorId))).returning({id: t.id});
        return deleted.length;
    }

    /** Delete plays and their inputs */
    deleteWithInputs = async (ids: number[]): Promise<void> => {
        if (ids.length === 0) {
            return;
        }
        await runTransaction(this.db, async () => {
            await this.db.delete(historicalPlayInputs).where(inArray(historicalPlayInputs.playId, ids));
            await this.db.delete(playsHistorical).where(inArray(playsHistorical.id, ids));
        });
    }

    findPlayIds = async (args: QueryPlaysOpts, opts: ComponentConstrainedRepoOpts = {}): Promise<number[]> => {
        const {
            componentId = this.componentId
        } = opts;

        let query: FindMany<'playsHistorical'> = {
            limit: args.limit,
            offset: args.offset,
        };

        query.where = buildPlayHistoricalWhere({componentId: componentId,  ...args});

        if (args.sort !== undefined) {
            query.orderBy = {
                [args.sort]: args.order ?? 'desc'
            }
        } else {
            query.orderBy = {
                id: 'asc'
            }
        }

        query = removeUndefinedKeys(query, false);
        const results = await this.db.query.playsHistorical.findMany({
            ...query,
            limit: args.limit,
            offset: args.offset,
            columns: {id: true},
            orderBy: args.sort !== undefined ? {[args.sort]: args.order ?? 'desc'} : {id: 'asc'},
        });
        return results.map((x) => x.id);
    }

    findPlayIdentifiers = async <T extends keyof PlayIdentifierPrimitiveMap>(args: QueryPlaysOpts, identifier: T, opts: ComponentConstrainedRepoOpts = {}): Promise<PlayIdentifierPrimitiveMap[T][]> => {
        const {
            componentId = this.componentId,
        } = opts;

        const results = await this.db.query.playsHistorical.findMany({
            limit: args.limit,
            offset: args.offset,
            columns: {id: true, uid: true},
            orderBy: args.sort !== undefined ? {[args.sort]: args.order ?? 'desc'} : {id: 'asc'},
            where: buildPlayHistoricalWhere({componentId: componentId,  ...args})
        });

        // we getting fancy now
        return results.map(identifierExtractor[identifier] as (play: {id: number, uid: string | null}) => PlayIdentifierPrimitiveMap[T]);
    }

    findPlaysPaginated = async (args: QueryPlaysOpts, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<PaginatedResponse<PlayHistoricalSelect>> => {
        const {
            limit = 100,
            offset = 0,
            ...rest
        } = args;
        const clampedLimit = Math.min(limit, 100);
        const res = await this.findPlays({limit: clampedLimit, offset, ...rest}, opts);
        return {data: res, meta: {limit: clampedLimit, offset}};
    }

    // async updateById(id: number, data: Partial<PlayNew>): Promise<void> {
    //     if(data.play !== undefined) {
    //         data.play = withoutDbAwareness(data.play);
    //     }
    //     super.updateById(id, data);
    // }

    deletePlays = async (playsData: (Pick<PlayHistoricalSelect, 'id'> | number)[]) => {
        const ids = playsData.map(x => typeof x === 'number' ? x : x.id);
        await this.db.delete(playsHistorical).where(inArray(playsHistorical.id, ids));
    }

    public checkExisting = async (play: PlayObject, opts: {taAccuracy?: TemporalAccuracy[]} & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelect | undefined> => {
        const {
            componentId = this.componentId,
            taAccuracy = TA_DEFAULT_ACCURACY,
        } = opts;
        const hash = hashObject(playContentBasicInvariantTransform(play).data);

        // we get all plays with a play date between playdate - (source accuracy) AND (playDateCompleted or playDate) + (source accuracy)
        // which we can then use with temporal comparison to make sure we are comparing the correct dates
        //
        // this isn't as fast as just comparing playDate directly but its still much faster/cheaper than paginating plays and doing everything in-memory
        //const dateGranularity = getTemporalAccuracyCloseVal(play.meta.source as SourceType);
        // let endRange: Dayjs;
        // if(play.data.playDateCompleted !== undefined) {
        //     // this will be present if source reports it
        //     // or we tracked it live with MemorySource
        //     endRange = play.data.playDateCompleted.add(dateGranularity, 's');
        // } else {
        //     endRange = getScrobbleTsSOCDate(play).add(dateGranularity, 's');
        // }
        const where: FindWhere<'playsHistorical'> = {
            componentId: componentId ?? EmptyFilter,
            playedAt: buildDateCompare(getTemporallyCloseDateCompareOp(play)),
        };

        const mbidId = playMbidIdentifier(play);
        if(mbidId !== undefined) {
            where.AND = [
                {
                    OR: [
                        {
                            playHash: hash
                        },
                        {
                            mbidIdentifier: mbidId
                        }
                    ]
                }
            ]
        } else {
            where.playHash = hash;
        }

        const res = await this.db.query.playsHistorical.findMany({
            where
        });
        if(res.length === 0) {
            return undefined;
        }
        return res.map(x => ({...x, play: hydratePlaySelect(x)})).find(x => {
            const temporalComparison = comparePlayTemporally(x.play, play);
            return hasAcceptableTemporalAccuracy(temporalComparison.match, taAccuracy)
        })
    }

    public getTemporallyClosePlays = async (play: PlayObject, opts: {bufferTime?: number} & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelect[]> => {
        const {
            componentId = this.componentId,
            bufferTime
        } = opts;

        const query: FindMany<'playsHistorical'> = {};

        const where: FindWhere<'playsHistorical'> = {
            componentId: componentId ?? EmptyFilter,
            playedAt: buildDateCompare(getTemporallyCloseDateCompareOp(play, {bufferTime})),
        };
        query.where = where;

        return ((await this.db.query.playsHistorical.findMany({
            where,
        })) as PlayHistoricalSelect[]).map(x => ({...x, play: hydratePlaySelect(x)}));
    }

    public getPlayCountByComponent = async () => {

        const res = await this.db.all<{componentId: number, 'count(*)': number}>(sql`select componentId, count(*) from plays_historical p
group by componentId;`);
        return res;
    }
}

export const buildPlayHistoricalWhere = (args: PlayWhereOpts): WhereClause<'playsHistorical'> => {
    // old way
    // let where: Parameters<(ReturnType<typeof getDb>)['query']['plays']['findMany']>[0]['where'] = {
    // };
    const where: FindWhere<'playsHistorical'> = {
        componentId: args.componentId ?? EmptyFilter,
        mirrorId: args.mirrorId ?? EmptyFilter
    };
    if (args.seenAt !== undefined) {
        where.seenAt = buildDateCompare(args.seenAt);
    }
    if (args.playedAt !== undefined) {
        where.playedAt = buildDateCompare(args.playedAt);
    }
    if(args.uid !== undefined) {
        where.uid = {
            in: args.uid
        }
    }
    return where;
}

/**
 * Moves raw upstream data (play.original) into `input` so it is stored in historical_play_inputs instead of the play json
 * */
export const playToRepositoryCreatePlayHistoricalOpts = (data: MarkOptional<RepositoryCreatePlayHistoricalOpts, 'componentId'>): RepositoryCreatePlayHistoricalOpts => {
    const {
        play: {
            original,
            ...playRest
        },
        ...rest
    } = data;
    const opts: RepositoryCreatePlayHistoricalOpts = {
        uid: data.play.meta?.playId,
        ...rest,
        play: playRest,
    };
    if(original !== undefined && opts.input === undefined) {
        opts.input = {play: original.play, data: original.data};
    }
    return opts;
}