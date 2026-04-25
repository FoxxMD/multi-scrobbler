import { childLogger, Logger, LoggerAppExtras } from "@foxxmd/logging";
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
import { CompactableProperty, RetentionOptions, retentionPlayTypes } from "../../../infrastructure/config/database.js";
import { shortTodayAwareFormat } from "../../../../../core/TimeUtils.js";

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

    findPurgablePlayIds = async (componentId: number, olderThanDate: Dayjs, opts: { states?: PlaySelect['state'][], compacted?: string } = {}): Promise<number[]> => {

        const {
            states,
            compacted
        } = opts;

        let where: FindWhere<'plays'> = {
            component: {
                id: componentId
            },
            seenAt: {
                lte: olderThanDate
            },
            NOT: {
                children: {}
            }
        };

        if (states !== undefined) {
            where.state = {
                in: states
            }
        }

        if(compacted !== undefined) {
            where.compacted = {
                OR: [
                    {
                        isNull: true
                    },
                    {
                        NOT: {
                            eq: compacted
                        }
                    }
                ]
            }
        }

        const rows = await this.db.query.plays.findMany({
            columns: {
                id: true
            },
            where,
            orderBy: {
                id: 'asc'
            }
        });

        return rows.map(x => x.id);
    }

    public retentionCleanup = async (componentId: number, componentType: string, retentionOpts: RetentionOptions) => {

        const loggerDel = childLogger(this.logger, ['Retention', 'Delete']);
        const loggerCom = childLogger(this.logger, ['Retention', 'Compact']);
        let summaryDelStates: string[] = [];
        let summaryCompactStates: string[] = [];

        loggerDel.debug('Starting cleanup...');
        for(const retentionType of retentionPlayTypes) {
            try {
                const date = dayjs().subtract(retentionOpts.deleteAfter[retentionType].asMilliseconds());
                let state: PlaySelect['state'];
                if(retentionType === 'completed') {
                    state = componentType === 'source' ? 'discovered' : 'scrobbled';
                } else {
                    state = retentionType;
                }
                loggerDel.trace(`Finding '${retentionType}' plays older than ${shortTodayAwareFormat(date)}...`);
                const ids = await this.findPurgablePlayIds(componentId, date, {states: [state]});
                loggerDel.trace(`Found ${ids.length} '${retentionType}' plays`);
                if(ids.length === 0) {
                    summaryDelStates.push(`No '${retentionType}' Plays older than ${shortTodayAwareFormat(date)}`);
                } else {
                    loggerDel.trace(`Deleting ${ids.length} '${retentionType}' plays`);
                    await this.deletePlays(ids);
                    loggerDel.trace(`'${retentionType}' plays deleted!`);
                    summaryDelStates.push(`${ids.length} '${retentionType}' Plays older than ${shortTodayAwareFormat(date)}`)
                }
            } catch (e) {
                loggerDel.warn(new Error(`Failed to perform retention cleanup on '${retentionType}' type`, {cause: e}));
            }
        }
        loggerDel.verbose(`Cleanup done! Summary:\n${summaryDelStates.join(' | ')}`);

        if(retentionOpts.compact.length === 0) {
            loggerCom.debug('Compacting is disabled, skipping cleanup.');
            return;
        }

        const compactTypes = retentionOpts.compact;
        let compactedFlags: CompactableProperty[] = [];
        if(compactTypes.includes('input')) {
            compactedFlags.push('input');
        }
        if(compactTypes.includes('transform')) {
            compactedFlags.push('transform');
        }

        loggerCom.debug('Starting cleanup...');
        for(const retentionType of retentionPlayTypes) {
            if(retentionOpts.compactAfter[retentionType] === false) {
                summaryCompactStates.push(`Skipped ${retentionType}`);
                continue;
            }
            try {
                const date = dayjs().subtract(retentionOpts.compactAfter[retentionType].asMilliseconds());
                let state: PlaySelect['state'];
                if(retentionType === 'completed') {
                    state = componentType === 'source' ? 'discovered' : 'scrobbled';
                } else {
                    state = retentionType;
                }
                loggerCom.trace(`Finding '${retentionType}' plays older than ${shortTodayAwareFormat(date)}...`);
                const ids = await this.findPurgablePlayIds(componentId, date, {compacted: compactedFlags.join('-'), states: [state]});
                loggerCom.trace(`Found ${ids.length} '${retentionType}' plays`);
                if(ids.length === 0) {
                    summaryDelStates.push(`No '${retentionType}' Plays older than ${shortTodayAwareFormat(date)}`);
                } else {
                    for(const id of ids) {
                        let compactedPlay: PlayObject;
                        if(compactTypes.includes('input')) {
                            this.db.update(playInputs).set({
                                data: {removedReason: 'Removed by compaction'}
                            }).where(eq(playInputs.playId, id));
                        }
                        if(compactTypes.includes('transform')) {
                            const playRow = await this.db.query.plays.findFirst({where: {id: id}});
                            if(playRow === undefined) {
                                // uhh shouldn't be
                                loggerCom.warn(`No Play found with ID ${id}, but it should have been...`);
                                continue;
                            }

                            const compactedPlay: PlayObject = playRow.play;
                            compactedPlay.meta.lifecycle.steps = compactedPlay.meta.lifecycle.steps.map(x => {
                                if(x.inputs == undefined) {
                                    return x;
                                }
                                return {...x, inputs: x.inputs.map(y => ({type: y.type, input: 'Removed by compaction'}))};
                            });
                        }

                        const updater = this.db.update(plays);
                        const vals: Parameters<typeof updater.set>[0] = {
                            compacted: compactedFlags.join('-')
                        };
                        if(compactedPlay !== undefined) {
                            vals.play = compactedPlay;
                        }
                        this.db.update(plays).set(vals)
                    }
                    loggerCom.trace(`Compacted ${ids.length} '${retentionType}' plays`);
                    await this.deletePlays(ids);
                    loggerCom.trace(`'${retentionType}' plays deleted!`);
                    summaryCompactStates.push(`${ids.length} '${retentionType}' Plays older than ${shortTodayAwareFormat(date)}`)
                }
            } catch (e) {
                loggerCom.warn(new Error(`Failed to perform retention cleanup on '${retentionType}' type`, {cause: e}));
            }
        }

        loggerCom.verbose(`Cleanup done! Summary:\n${summaryDelStates.join(' | ')}`);
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
    if (args.playedAt !== undefined) {
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