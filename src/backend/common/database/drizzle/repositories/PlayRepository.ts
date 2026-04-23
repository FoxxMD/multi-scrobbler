import { Logger, LoggerAppExtras } from "@foxxmd/logging";
import { DbConcrete, getDb, runTransaction } from "../drizzleUtils.js";
import { loggerNoop } from "../../../MaybeLogger.js";
import { PlayObject } from "../../../../../core/Atomic.js";
import { generateInputEntity, generatePlayEntity, PlayEntityOpts } from "../entityUtils.js";
import { playInputs, plays, relations } from "../schema/schema.js";
import { PlayNew, PlaySelect, PlayInputNew, FindWhere, FindMany } from "../drizzleTypes.js";;
import { MarkOptional, MarkRequired, PathValue } from "ts-essentials";
import { removeUndefinedKeys } from "../../../../utils.js";

// https://github.com/drizzle-team/drizzle-orm/issues/695 may be useful for typing models with relations?

export interface DrizzleRepositoryOpts {
    logger?: Logger
}

export interface PlayWhereOpts {
    state?: PlaySelect['state'][]
    componentId?: number
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
        }
        query = removeUndefinedKeys(query);
        const results = await this.db.query.plays.findMany(query);
        return results;
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
    return where;
}