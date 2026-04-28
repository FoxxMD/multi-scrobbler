import { childLogger, Logger, LoggerAppExtras } from "@foxxmd/logging";
import { DbConcrete, getDb, runTransaction } from "../drizzleUtils.js";
import { loggerNoop } from "../../../MaybeLogger.js";
import { ErrorLike, PlayObject } from "../../../../../core/Atomic.js";
import { generateInputEntity, generatePlayEntity, PlayEntityOpts, hydratePlaySelect, PlayHydateOptions } from "../entityUtils.js";
import { playInputs, plays, queueStates, relations } from "../schema/schema.js";
import { PlayNew, PlaySelect, PlayInputNew, FindWhere, FindMany, CompareOpKey, QueueStateSelect, PlayInputSelect } from "../drizzleTypes.js";;
import { MarkOptional, MarkRequired, PathValue } from "ts-essentials";
import { genGroupIdStrFromPlay, removeEmptyArrays, removeUndefinedKeys } from "../../../../utils.js";
import dayjs, { Dayjs } from "dayjs";
import { RelationsFieldFilter, eq, inArray, ne, notInArray, desc, asc, and } from "drizzle-orm";
import { CompactableProperty, RetentionOptions, retentionPlayTypes } from "../../../infrastructure/config/database.js";
import { shortTodayAwareFormat } from "../../../../../core/TimeUtils.js";
import { buildDateCompare, CompareDateOp, ComponentConstrainedRepoOpts, DrizzleBaseRepository, DrizzleRepositoryOpts, PaginatedQueryResponse } from "./BaseRepository.js";
import { asPlay } from "../../../../../core/PlayMarshalUtils.js";
import assert from "node:assert";
import { hashObject, parseArrayFromMaybeString } from "../../../../utils/StringUtils.js";
import { playContentBasicInvariantTransform, playMbidIdentifier } from "../../../../utils/PlayComparisonUtils.js";

// https://github.com/drizzle-team/drizzle-orm/issues/695 may be useful for typing models with relations?

export interface PlayWhereOpts {
    state?: PlaySelect['state'][]
    stateNot?: PlaySelect['state'][]
    componentId?: number
    platformId?: string
    seenAt?: CompareDateOp
    playedAt?: CompareDateOp
    queueCriteria?: {queueName: string, states?: QueueStateSelect['queueStatus'][]}
    uid?: string[]
}

export type WithPlayRelation = 'input' | 'parent' | 'parent-input' | 'queues';
export interface QueryPlaysOpts extends PlayWhereOpts {
    sort?: 'seenAt' | 'playedAt'
    order?: 'asc' | 'desc'
    with?: WithPlayRelation[]
    limit?: number
    offset?: number
}

export interface HydrateOpts {
   hydrate?: PlayHydateOptions[] 
}

export type RepositoryCreatePlayOpts = PlayEntityOpts
    & {
        input: MarkOptional<PlayInputNew, 'playId' | 'play'>
    }
    & Pick<PlayNew, 'play' | 'componentId'>;
export class DrizzlePlayRepository extends DrizzleBaseRepository<'plays'> {

    constructor(db: ReturnType<typeof getDb>, opts: DrizzleRepositoryOpts = {}) {
        super(db, 'plays', 'Plays', opts);
    }

    findByUid = async (uid: string, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<PlaySelect & {queueStates: QueueStateSelect[]}> => {
        const res = await this.db.query.plays.findFirst({
            where: {
                uid,
                componentId: opts.componentId ?? this.componentId
            },
            with: {
                queueStates: true
            }
        });
        res.play = hydratePlaySelect(res, opts.hydrate);
        return res;
    }

    createPlays = async (entitiesOpts: RepositoryCreatePlayOpts[], opts: HydrateOpts = {}) => {

        const {
            hydrate = []
        } = opts;
        let playRows: PlaySelect[];

        await runTransaction(this.db, async () => {

            const entitiesData = entitiesOpts.map((data) => {
                const {
                    play,
                    input,
                    ...rest
                } = data;
                return generatePlayEntity(play, { componentId: this.componentId, ...rest });
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

        return playRows.map(x => ({...x, play: hydratePlaySelect(x, hydrate)}));
    }

    findPlays = async (args: QueryPlaysOpts, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<PlaySelect[]> => {
        const {
            hydrate = [],
            componentId = this.componentId
        } = opts;
        // this does not work as type for query variable
        // it erases the result type for some reason
        //
        // Parameters<typeof this.db.query.plays.findMany>[0]
        
        // this does work but it is also integrated into FindWith
        //let withQuery: Parameters<typeof this.db.query.plays.findMany>[0]['with'] = undefined;

        let query: FindMany<'plays'> = {
            limit: args.limit,
            offset: args.offset
        };

        query.where = buildPlayWhere({componentId: componentId,  ...args});

        if (args.sort !== undefined) {
            query.orderBy = {
                [args.sort]: args.order ?? 'desc'
            }
        } else {
            query.orderBy = {
                id: 'asc'
            }
        }

        if(args.with !== undefined) {
            query.with = {};
            for(const w of args.with) {
                switch (w) {
                    case 'input':
                        query.with.input = true;
                        break;
                    case 'parent':
                        query.with.parent = true;
                        break;
                    case 'parent-input':
                        query.with.parent = {
                            with: {
                                input: true
                            }
                        };
                        break;
                    case 'queues':
                        query.with.queueStates = true;
                        break;
                    default:
                        throw new Error(`Unknown relation ${w}`);
                }
            }
        }
        query = removeUndefinedKeys(query);
        const results = await this.db.query.plays.findMany(query);
        if(hydrate.length > 0) {
            return results.map((x) => ({...x, play: hydratePlaySelect(x, hydrate)}));
        }
        return results;
    }

    findPlaysPaginated = async (args: QueryPlaysOpts, opts: HydrateOpts & ComponentConstrainedRepoOpts = {}): Promise<{data: (PlaySelect & {
        queueStates?: QueueStateSelect[]
        input?: PlayInputSelect
        parent?: PlaySelect
    })[], meta: {offset: number, limit: number}}> => {
        const {
            limit,
            offset = 0,
            ...rest
        } = args;
        const clampedLimit = Math.min(limit, 100);
        const res = await this.findPlays({limit: clampedLimit, offset, ...rest}, opts);
        return {data: res, meta: {limit: clampedLimit, offset}};
    }

    async updateById(id: number, data: Partial<PlayNew>): Promise<void> {
        if(data.play !== undefined) {
            data.play = withoutDbAwareness(data.play);
        }
        super.updateById(id, data);
    }

    setStateById = async (state: PlayNew['state'], ids: number[]): Promise<void> => {
        const validIds = ids.filter(x => x !== undefined && x !== null);
        assert(validIds.length > 0, `Should not pass empty array of ids, after filtering, to update state. Original ids list: ${ids}`);
        await this.db.update(plays).set({state}).where(inArray(plays.id, ids));
    }

    deletePlays = async (playsData: (Pick<PlaySelect, 'id'> | number)[]) => {
        const ids = playsData.map(x => typeof x === 'number' ? x : x.id);
        await this.db.delete(plays).where(inArray(plays.id, ids));
    }

    findPurgablePlayIds = async (olderThanDate: Dayjs, opts: { states?: PlaySelect['state'][], compacted?: string } & ComponentConstrainedRepoOpts = {}): Promise<number[]> => {

        const {
            states,
            compacted,
            componentId = this.componentId
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

    public retentionCleanup = async (componentType: string, retentionOpts: RetentionOptions & ComponentConstrainedRepoOpts) => {

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
                const ids = await this.findPurgablePlayIds(date, {states: [state], componentId: retentionOpts.componentId});
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
                const ids = await this.findPurgablePlayIds(date, {compacted: compactedFlags.join('-'), states: [state], componentId: retentionOpts.componentId});
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

    public selectRecentDistinctPlatforms = async (limitPlays: number = 500, opts: ComponentConstrainedRepoOpts = {}): Promise<string[]> => {
        const {
            componentId = this.componentId
        } = opts;

        const recentPlatformIds = await this.db.selectDistinct({platformId: plays.platformId}).from(plays)
        .where(
            and(
                eq(plays.componentId, componentId),
                ne(plays.state, 'queued'))
        )
        .orderBy(desc(plays.playedAt))
        .limit(limitPlays);
        return recentPlatformIds.map(x => x.platformId);
    }

    public getQueueNext = async (queueName: string, opts: {order?: 'asc' | 'desc', retries?: number} & ComponentConstrainedRepoOpts = {}): Promise<PlaySelect & {queueStates: QueueStateSelect[]} | undefined> => {
        const {
            retries,
            order = 'asc',
            componentId = this.componentId
        } = opts;

        let where: FindWhere<'plays'> = {
            componentId
        }

        if(retries !== undefined) {
            where.queueStates = {
                queueName,
                queueStatus: 'queued',
                retries: {
                    lte: retries
                }
            }
        } else {
            where.queueStates = {
                queueName,
                queueStatus: 'queued'
            }
        }

        const res = await this.db.query.plays.findFirst({
                where: where,
                orderBy: {
                    seenAt: order
                },
                with: {
                    queueStates: true
                }
        });
        res.play = asPlay(res.play);
        return res;
    }

    public getQueued = async (queueName: string, opts: {
        order?: 'asc' | 'desc',
        limit?: number,
        offset?: number,
        retries?: number,
    } & ComponentConstrainedRepoOpts = {}
    ): Promise<{data: PlaySelect[], meta: PaginatedQueryResponse}> => {
        const {
            order = 'asc',
            limit = 100,
            offset = 0,
            retries,
            componentId = this.componentId
        } = opts;
        let where: FindWhere<'plays'> = {
            componentId
        }
        if(retries !== undefined) {
            where.queueStates = {
                queueName,
                queueStatus: 'queued',
                retries: {
                    lte: retries
                }
            }
        } else {
            where.queueStates = {
                queueName,
                queueStatus: 'queued'
            }
        }
        const res = await this.db.query.plays.findMany({
            where,
            orderBy: {
                seenAt: order
            },
            limit,
            offset
        });
        return {data: res, meta: {limit, offset}};
    }

    public checkExistingQuick = async (play: PlayObject, opts: {queueName?: string} & ComponentConstrainedRepoOpts = {}): Promise<PlaySelect & {queueStates: QueueStateSelect[]} | undefined> => {
        const {
            queueName,
            componentId = this.componentId
        } = opts;
        const hash = hashObject(playContentBasicInvariantTransform(play).data);

        let where: FindWhere<'plays'> = {
            componentId,
            playedAt: {
                eq: play.data.playDate
            },
        };
        if(queueName !== undefined) {
            where.queueStates = {
                queueName,
                queueStatus: 'queued'
            }
        }

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

        return this.db.query.plays.findFirst({
            where,
            with: {
                queueStates: true
            }
        })
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
    if(args.stateNot !== undefined) {
        where.state = {
            NOT: {
                in: args.stateNot
            }
        }
    }
    if (args.seenAt !== undefined) {
        where.seenAt = buildDateCompare(args.seenAt);
    }
    if (args.playedAt !== undefined) {
        where.playedAt = buildDateCompare(args.playedAt);
    }
    if(args.platformId !== undefined) {
        where.platformId = args.platformId
    }
    if(args.uid !== undefined) {
        where.uid = {
            in: args.uid
        }
    }
    return where;
}

export const playToRepositoryCreatePlayOpts = (data: MarkOptional<RepositoryCreatePlayOpts, 'input' | 'componentId'>): RepositoryCreatePlayOpts => {
    const {
        play: {
            meta: {
                lifecycle: {
                    input,
                    original,
                    ...lifecycleRest
                } = {},
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
                    ...lifecycleRest
                }
            }
        },
        ...rest,
        input: {
            play: original,
            data: input
        },
        platformId: genGroupIdStrFromPlay(data.play)
    }
}

const withoutDbAwareness = (play: PlayObject): PlayObject => {
    const {
        meta: {
            dbUid,
            dbId,
            ...metaRest
        } = {},
        ...playRest
    } = play;

    return {
        ...playRest,
        meta: metaRest
    }
}

export type RequestPlayQuery = Partial< Record<keyof Exclude<QueryPlaysOpts, 'componentId' | 'platformId'>, string>>;

export const queryArgsFromRequest = (rec: RequestPlayQuery): QueryPlaysOpts => {

    const {
        state,
        stateNot,
        uid,
        with: withQuery,
        seenAt,
        playedAt,
        limit,
        sort,
        order,
        offset,
        componentId,
        queueCriteria,
        ...rest
    } = rec;

    let queryArgs: QueryPlaysOpts = removeEmptyArrays<QueryPlaysOpts>({
        state: parseArrayFromMaybeString(state) as PlaySelect['state'][],
        stateNot: parseArrayFromMaybeString(stateNot) as PlaySelect['state'][],
        uid: parseArrayFromMaybeString(uid),
        with: parseArrayFromMaybeString(withQuery) as WithPlayRelation[],
        sort: sort as 'playedAt' | 'seenAt',
        order: order as 'asc' | 'desc',
        ...rest
    });

    if(limit !== undefined) {
        queryArgs.limit = Number.parseInt(limit);
    }
    if(offset !== undefined) {
        queryArgs.offset = Number.parseInt(offset);
    }

    return queryArgs;
}