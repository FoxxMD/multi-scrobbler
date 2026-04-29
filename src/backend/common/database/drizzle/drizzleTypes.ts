import { DBQueryConfig, DBQueryConfigWith, ExtractTablesFromSchema, KnownKeysOnly, RelationFieldsFilterInternals, Many, InferSelectModel, ExtractTablesWithRelations } from "drizzle-orm";
import { components, playInputs, plays, queueStates, relations } from "./schema/schema.js";
import {TSchema, TableName, Schema } from "./schema/schema.js";


export type ComponentNew = typeof components.$inferInsert;
export type ComponentSelect = typeof components.$inferSelect;

export type QueueStateNew = typeof queueStates.$inferInsert;
export type QueueStateSelect = typeof queueStates.$inferSelect;

export type PlayInputNew = typeof playInputs.$inferInsert;
export type PlayInputSelect = typeof playInputs.$inferSelect;

export type PlaySelect = typeof plays.$inferSelect;
export type PlaySelectRel = ModelWithRelations<typeof plays>;
export type PlayNew = typeof plays.$inferInsert;


// useful references for building types
// https://github.com/drizzle-team/drizzle-orm/discussions/2596
// https://github.com/drizzle-team/drizzle-orm/discussions/1539
// https://gist.github.com/ikupenov/10bc89d92d92eaba8cc5569013e04069
// https://github.com/drizzle-team/drizzle-orm/issues/695 most examples
// https://github.com/drizzle-team/drizzle-orm/discussions/2316 relation focused
// https://github.com/drizzle-team/drizzle-orm/issues/1319

//type p = TSchema['plays']['relations'];
export type FindWith<T extends TableName> = DBQueryConfigWith<TSchema, TSchema[T]['relations']>;
export type QueryConfig<T extends TableName> = DBQueryConfig<"many", TSchema, TSchema[T]>;
export type FindMany<T extends TableName> = Pick<KnownKeysOnly<QueryConfig<T>, DBQueryConfig<"many", TSchema, TSchema[T]>>, 'where' | 'orderBy' | 'limit' | 'offset' | 'extras'> & {with?: FindWith<T>}
export type FindOne<T extends TableName> = Pick<KnownKeysOnly<QueryConfig<T>, DBQueryConfig<"one", TSchema, TSchema[T]>>, 'where' | 'orderBy' | 'limit' | 'offset' | 'extras'> & {with?: FindWith<T>}
export type FindWhere<T extends TableName> = QueryConfig<T>['where'];

export type CompareOp<T> = Pick<RelationFieldsFilterInternals<T>, 'gt' | 'gte' | 'eq' | 'lt' | 'lte' | 'ne'>
export type CompareOpKey<T> = keyof CompareOp<T>;



/**
 * Based on https://github.com/drizzle-team/drizzle-orm/issues/695#issuecomment-3133969178
 */

// Helper type to find the tsName corresponding to a given dbName in TSchema
type FindTsNameByDbName<TDbNameToFind extends string> = {
    [K in keyof TSchema]: TSchema[K] extends {
        // updated dbName -> name
        name: TDbNameToFind;
    }
        ? K
        : TDbNameToFind;
}[keyof TSchema];

// Helper type to find the dbName corresponding to a given tsName in TSchema
type FindDbNameByTsName<TTable extends Schema[keyof Schema]> = {
    [K in keyof Schema]: Schema[K] extends TTable ? K : never;
}[keyof Schema];

/**
 * Utility type to infer the model type for a given table name from the schema.
 * Handles nested relations recursively.
 * Uses referencedTableName (dbName) and FindTsNameByDbName helper.
 */
export type ModelWithRelationsFromName<
    TTableName extends keyof TSchema,
> = InferSelectModel<Schema[TTableName]> & {
    [K in keyof TSchema[TTableName]['relations']]?: TSchema[TTableName]['relations'][K] extends infer TRelation
        // updated referencedTableName -> targetTableName
        ? TRelation extends { targetTableName: infer TRefDbName extends string }
            ? FindTsNameByDbName<TRefDbName> extends infer TRefTsName extends
                  keyof TSchema
                ? TRelation extends Many<any>
                    ? ModelWithRelationsFromName<TRefTsName>[]
                    : ModelWithRelationsFromName<TRefTsName> | null
                : never
            : never
        : never;
};

/**
 * Utility type to infer the model type for a given table from the schema.
 * Handles nested relations recursively.
 * Uses referencedTableName (dbName) and FindDbNameByTsName helper.
 */
export type ModelWithRelations<TTable extends Schema[keyof Schema]> =
    FindDbNameByTsName<TTable> extends infer TTableName extends keyof TSchema
        ? ModelWithRelationsFromName<TTableName>
        : never;


// all relations are are now fully typed and optional
//type FullPlay = ModelWithRelations<typeof plays>;