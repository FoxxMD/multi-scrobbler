import { Logger, LoggerAppExtras } from "@foxxmd/logging";
import { DbConcrete, getDb, runTransaction } from "../drizzleUtils.js";
import { loggerNoop } from "../../../MaybeLogger.js";
import { PlayObject } from "../../../../../core/Atomic.js";
import { generateInputEntity, generatePlayEntity, PlayEntityOpts } from "../entityUtils.js";
import { playInputs, plays, relations } from "../schema/schema.js";
import { PlayNew, PlaySelect, PlayInputNew, FindWhere, FindMany, CompareOpKey } from "../drizzleTypes.js";;
import { MarkOptional, MarkRequired, PathValue } from "ts-essentials";
import { removeUndefinedKeys } from "../../../../utils.js";
import dayjs, { Dayjs } from "dayjs";
import { RelationsFieldFilter, eq, inArray } from "drizzle-orm";

// https://github.com/drizzle-team/drizzle-orm/issues/695 may be useful for typing models with relations?

export interface DrizzleRepositoryOpts {
    logger?: Logger
}

type CompareDateOp = {
    type: CompareOpKey<Dayjs>
    date: Dayjs
} | {
    type: 'between',
    range: [Dayjs, Dayjs],
    inclusive?: boolean
}

export interface PlayWhereOpts {
    state?: PlaySelect['state'][]
    componentId?: number
    seenAt?: CompareDateOp
    playedAt?: CompareDateOp
}

export interface QueryPlaysOpts extends PlayWhereOpts {
    sort?: 'seenAt' | 'playedAt'
    order?: 'asc' | 'desc'
    limit?: number
    offset?: number
}

export type RepositoryCreatePlayOpts = PlayEntityOpts
    & {
        input: MarkOptional<PlayInputNew, 'playId' | 'play'>
    }
    & MarkRequired<Pick<PlayNew, 'play' | 'componentId'>, 'componentId'>;
export class DrizzlePlayRepository {

    logger: Logger;
    db: ReturnType<typeof getDb>;

    constructor(db: ReturnType<typeof getDb>, opts: DrizzleRepositoryOpts = {}) {
        this.db = db;
        this.logger = opts.logger ?? loggerNoop;
    }

    createPlays = async (entitiesOpts: RepositoryCreatePlayOpts[]) => {

        let playRows: PlaySelect[];

        await runTransaction(this.db, async () => {

            const entitiesData = entitiesOpts.map((data) => {
                const {
                    play,
                    input,
                    ...rest
                } = data;
                return generatePlayEntity(play, { ...rest });
            });

            playRows = await this.db.insert(plays).values(entitiesData).returning();

            const inputDatas = playRows.map((x, index) => {
                const {
                    play,
                    input,
                } = entitiesOpts[index];
                const {
                    play: inputPlay = play,
                    ...restInput
                } = input;

                return generateInputEntity({ play: inputPlay, playId: x.id, ...restInput });
            });

            const inputRow = await this.db.insert(playInputs).values(inputDatas);

        });

        return playRows;
    }

    findPlays = async (args: QueryPlaysOpts): Promise<PlaySelect[]> => {
        //let oldQuery: Parameters<typeof this.db.query.plays.findMany>[0] = {};
        let query: FindMany<'plays'> = {
            limit: args.limit,
            offset: args.offset
        };

        query.where = buildPlayWhere(args);

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
        const results = await this.db.query.plays.findMany(query);
        return results;
    }

    deletePlays = async (playsData: (Pick<PlaySelect, 'id'> | number)[]) => {
        const ids = playsData.map(x => typeof x === 'number' ? x : x.id);
        await this.db.delete(plays).where(inArray(plays.id, ids));
    }
}

export const buildPlayWhere = (args: PlayWhereOpts): FindWhere<'plays'> => {
    // old way
    // let where: Parameters<(ReturnType<typeof getDb>)['query']['plays']['findMany']>[0]['where'] = {
    // };
    let where: FindWhere<'plays'> = {
        componentId: args.componentId
    };
    if (args.state !== undefined) {
        where.state = {
            in: args.state
        }
    }
    if (args.seenAt !== undefined) {
        where.seenAt = buildDateCompare(args.seenAt);
    }
    if(args.playedAt !== undefined) {
        where.playedAt = buildDateCompare(args.playedAt);
    }
    return where;
}

const buildDateCompare = (data: CompareDateOp): RelationsFieldFilter<Dayjs> => {
    let q: RelationsFieldFilter<Dayjs> = {};
    if (data.type !== 'between') {
        q = {
            [data.type]: data.date
        }
    } else {
        q = {
            AND: [
                {
                    [data.inclusive ?? true ? 'gte' : 'gt']: data.range[0]
                },
                {
                    [data.inclusive ?? true ? 'lte' : 'lt']: data.range[1]
                },
            ]
        }
    }
    return q;
}