import { childLogger, Logger, LoggerAppExtras } from "@foxxmd/logging";
import { DbConcrete, runTransaction } from "../drizzleUtils.js";
import { loggerNoop } from "../../../MaybeLogger.js";
import { ErrorLike, PlayObject, TA_CLOSE, TA_DEFAULT_ACCURACY, TA_EXACT, TemporalAccuracy } from "../../../../../core/Atomic.js";
import { generateInputEntity, generatePlayEntity, PlayEntityOpts, hydratePlaySelect, PlayHydateOptions, PlayHistoricalEntityOpts } from "../entityUtils.js";
import { playInputs, plays, playsHistorical, queueStates, relations } from "../schema/schema.js";
import { PlayNew, PlaySelect, PlayInputNew, FindWhere, FindMany, QueueStateSelect, FindWith, PlaySelectWithQueueStates, WhereClause, PlayWith, PlayHistoricalSelect, PlayHistoricalNew } from "../drizzleTypes.js";;
import { MarkOptional, MarkRequired, PathValue } from "ts-essentials";
import { genGroupIdStrFromPlay, removeEmptyArrays, removeUndefinedKeys } from "../../../../utils.js";
import dayjs, { Dayjs } from "dayjs";
import { RelationsFieldFilter, eq, inArray, ne, notInArray, desc, asc, and, sql, Placeholder } from "drizzle-orm";
import { CompactableProperty, RetentionOptions, retentionPlayTypes } from "../../../infrastructure/config/database.js";
import { shortTodayAwareFormat } from "../../../../../core/TimeUtils.js";
import { buildDateCompare, CompareDateOp, ComponentConstrainedRepoOpts, DrizzleBaseRepository, DrizzleRepositoryOpts, PaginatedQueryResponse, PaginatedResponse } from "./BaseRepository.js";
import { asPlay } from "../../../../../core/PlayMarshalUtils.js";
import assert, { Assert } from "node:assert";
import { hashObject, parseArrayFromMaybeString } from "../../../../utils/StringUtils.js";
import { playContentBasicInvariantTransform, playMbidIdentifier } from "../../../../utils/PlayComparisonUtils.js";
import { comparePlayTemporally, getScrobbleTsSOCDate, getScrobbleTsSOCDateWithContext, getTemporalAccuracyCloseVal, hasAcceptableTemporalAccuracy } from "../../../../utils/TimeUtils.js";
import { SourceType } from "../../../infrastructure/config/source/sources.js";
import { getTemporallyCloseDateCompareOp } from "./PlayRepository.js";

// https://github.com/drizzle-team/drizzle-orm/issues/695 may be useful for typing models with relations?

export interface PlayWhereOpts {
    componentId?: number
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

export type RepositoryCreatePlayHistoricalOpts = PlayHistoricalEntityOpts
    & Pick<PlayHistoricalNew, 'play' | 'componentId'>;

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
        super(db, 'plays', 'Plays', opts);
    }

    findByUid = async (uid: string, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelect | undefined> => {
        const res = await this.db.query.playsHistorical.findFirst({
            where: {
                uid,
                componentId: opts.componentId ?? this.componentId
            }
        });
        res.play = hydratePlaySelect(res, opts.hydrate);
        return res;
    }

    hasByUid = async (uid: string, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<boolean> => {
        const res = await this.db.query.playsHistorical.findFirst({
            columns: {id: true},
            where: {
                uid,
                componentId: opts.componentId ?? this.componentId
            }
        });
        return res !== undefined;
    }

    createPlays = async (entitiesOpts: RepositoryCreatePlayHistoricalOpts[], opts: HydrateOpts = {}) => {

        const {
            hydrate
        } = opts;
        let playRows: PlayHistoricalSelect[];

        await runTransaction(this.db, async () => {

            const entitiesData = entitiesOpts.map((data) => {
                const {
                    play,
                    ...rest
                } = data;
                return generatePlayEntity(play, { componentId: this.componentId, ...rest });
            });

            playRows = await this.db.insert(playsHistorical).values(entitiesData).returning();
        });

        return playRows.map(x => ({...x, play: hydratePlaySelect(x, hydrate)}));
    }

    findPlays = async (args: QueryPlaysOpts, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelect[]> => {
        const {
            hydrate,
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

        query = removeUndefinedKeys(query);
        const results = await this.db.query.playsHistorical.findMany(query);
        return results.map((x) => ({...x, play: hydratePlaySelect(x, hydrate)}));
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

        query = removeUndefinedKeys(query);
        const results = await this.db.query.plays.findMany({
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
        return results.map(identifierExtractor[identifier]);
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
        await this.db.delete(playsHistorical).where(inArray(plays.id, ids));
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
        const dateGranularity = getTemporalAccuracyCloseVal(play.meta.source as SourceType);
        let endRange: Dayjs;
        if(play.data.playDateCompleted !== undefined) {
            // this will be present if source reports it
            // or we tracked it live with MemorySource
            endRange = play.data.playDateCompleted.add(dateGranularity, 's');
        } else {
            endRange = play.data.playDate.add(dateGranularity, 's');
        }
        let where: FindWhere<'playsHistorical'> = {
            componentId,
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

    public getTemporallyClosePlays = async (play: PlayObject, opts: {states?: PlaySelect['state'][], bufferTime?: number} & ComponentConstrainedRepoOpts = {}): Promise<PlayHistoricalSelect[]> => {
        const {
            componentId = this.componentId,
            bufferTime,
            states
        } = opts;

        let query: FindMany<'plays'> = {};

        let where: FindWhere<'plays'> = {
            componentId,
            playedAt: buildDateCompare(getTemporallyCloseDateCompareOp(play, {bufferTime})),
        };
        if(states !== undefined) {
            where.state = {
                in: states
            }
        }
        query.where = where;

        return ((await this.db.query.plays.findMany({
            where,
        })) as PlayHistoricalSelect[]).map(x => ({...x, play: hydratePlaySelect(x)}));
    }
}

export const buildPlayHistoricalWhere = (args: PlayWhereOpts): WhereClause<'playsHistorical'> => {
    // old way
    // let where: Parameters<(ReturnType<typeof getDb>)['query']['plays']['findMany']>[0]['where'] = {
    // };
    let where: FindWhere<'playsHistorical'> = {
        componentId: args.componentId
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

export const playToRepositoryCreatePlayHistoricalOpts = (data: MarkOptional<RepositoryCreatePlayHistoricalOpts, 'componentId'>): RepositoryCreatePlayHistoricalOpts => {
    const {
        play: {
            meta: {
                lifecycle,
                ...metaRest
            },
            ...playRest
        },
        ...rest
    } = data;

    return {
        play: {
            ...playRest,
            meta: {
                ...metaRest,
                // @ts-expect-error
                lifecycle: {
                }
            }
        },
        uid: data.play.meta?.playId,
        ...rest
    }
}