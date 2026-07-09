import { childLogger, type Logger } from "@foxxmd/logging";
import { type DbConcrete } from "../drizzleUtils.ts";
import { type Dayjs } from "dayjs";
import { type RelationsFieldFilter, eq, inArray } from "drizzle-orm";
import { loggerNoop } from "../../../MaybeLogger.ts";
import { capitalize } from "../../../../../core/StringUtils.ts";
import { getConfigByTableName, relations, type TableName } from "../schema/schema.ts";
import assert from 'node:assert';
import { Cacheable } from "cacheable";
import { type DateLike } from "../../../../../core/Atomic.ts";
import type { CompareDateBetween, CompareDateSingle } from "../../../../../core/Api.ts";

export interface DrizzleRepositoryOpts {
    logger?: Logger
    cache?: Cacheable
    componentId?: number
}

export type CompareDateOp<D extends DateLike = Dayjs> = CompareDateSingle<D> | CompareDateBetween<D>;
export interface ComponentConstrainedRepoOpts {
    componentId?: number
}

export abstract class DrizzleBaseRepository<T extends TableName> {

    logger: Logger;
    displayName: string;
    tableName: TableName;
    table: ReturnType<typeof getConfigByTableName<T>>
    db: DbConcrete;
    componentId?: number
    cache?: Cacheable

    constructor(db: DbConcrete, tableName: TableName, displayName: string, opts: DrizzleRepositoryOpts = {}) {
        this.db = db;
        this.displayName = displayName;
        this.tableName = tableName;
        this.table = getConfigByTableName(this.tableName);
        this.logger = childLogger(opts.logger ?? loggerNoop, ['Database', capitalize(displayName)]);
        this.componentId = opts.componentId;
        this.cache = opts.cache;
    }

    async deleteByIds(ids: number[]): Promise<void> {
        await this.db.delete(this.table).where(inArray(this.table.id, ids));
    }

    async updateById(id: number, data: Partial<typeof this.table.$inferInsert>): Promise<void> {
        assert(id !== null && id !== undefined, `${typeof id === null ? 'null' : 'undefined'} given for entity id`);
        await this.db.update(this.table).set(data).where(eq(this.table.id, id));
    }

    async create(data: typeof this.table.$inferInsert): Promise<typeof this.table.$inferSelect> {
        const res = await this.db.insert(this.table).values([data]).returning();
        return res[0];
    }

    async createMany(data: typeof this.table.$inferInsert[]): Promise<typeof this.table.$inferSelect[]> {
        const res = await this.db.insert(this.table).values(data).returning();
        return res;
    }

    async findById(id: number): Promise<typeof this.table.$inferSelect | undefined> {
        // const res = await this.db.query[this.tableName].findFirst({
        //     where: {
        //         id
        //     }
        // });
        const res = await this.db.select().from(this.table).where(eq(this.table.id, id));
        if(res.length === 0) {
            return undefined;
        }
        return res[0];
    }
}

export class GenericRepository<T extends TableName> extends DrizzleBaseRepository<T> {

}

export const buildDateCompare = (data: CompareDateOp): RelationsFieldFilter<Dayjs> => {
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