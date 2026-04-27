import { DBQueryConfig, DBQueryConfigWith, ExtractTablesFromSchema, KnownKeysOnly, RelationFieldsFilterInternals } from "drizzle-orm";
import { components, playInputs, plays, queueStates, relations } from "./schema/schema.js";
import {TSchema, TableName, Schema } from "./schema/schema.js";


export type ComponentNew = typeof components.$inferInsert;
export type ComponentSelect = typeof components.$inferSelect;

export type QueueStateNew = typeof queueStates.$inferInsert;
export type QueueStateSelect = typeof queueStates.$inferSelect;

export type PlayInputNew = typeof playInputs.$inferInsert;
export type PlayInputSelect = typeof playInputs.$inferSelect;

export type PlaySelect = typeof plays.$inferSelect;
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