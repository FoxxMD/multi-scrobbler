import { childLogger, Logger } from "@foxxmd/logging";
import { getDb } from "../drizzleUtils.js";
import { CompareOpKey } from "../drizzleTypes.js";
import { Dayjs } from "dayjs";
import { RelationsFieldFilter, eq, inArray } from "drizzle-orm";
import { loggerNoop } from "../../../MaybeLogger.js";
import { capitalize } from "../../../../../core/StringUtils.js";
import { getConfigByTableName, relations, TableName } from "../schema/schema.js";

export interface DrizzleRepositoryOpts {
    logger?: Logger
    componentId?: number
}

export type CompareDateOp = {
    type: CompareOpKey<Dayjs>
    date: Dayjs
} | {
    type: 'between',
    range: [Dayjs, Dayjs],
    inclusive?: boolean
}

export interface PaginatedQueryResponse {
    limit: number,
    offset: number
}

export interface ComponentConstrainedRepoOpts {
    componentId?: number
}

export abstract class DrizzleBaseRepository<T extends TableName> {

    logger: Logger;
    displayName: string;
    tableName: TableName;
    table: ReturnType<typeof getConfigByTableName<T>>
    db: ReturnType<typeof getDb>;
    componentId?: number

    constructor(db: ReturnType<typeof getDb>, tableName: TableName, displayName: string, opts: DrizzleRepositoryOpts = {}) {
        this.db = db;
        this.displayName = displayName;
        this.tableName = tableName;
        this.table = getConfigByTableName(this.tableName);
        this.logger = childLogger(opts.logger ?? loggerNoop, ['Database', capitalize(displayName)]);
        this.componentId = opts.componentId;
    }

    async deleteByIds(ids: number[]): Promise<void> {
        await this.db.delete(this.table).where(inArray(this.table.id, ids));
    }

    async updateById(id: number, data: Partial<typeof this.table.$inferInsert>): Promise<void> {
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