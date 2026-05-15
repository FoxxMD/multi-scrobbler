import { DBQueryConfig, DBQueryConfigWith, ExtractTablesFromSchema, KnownKeysOnly, RelationFieldsFilterInternals, Many, InferSelectModel, ExtractTablesWithRelations, type BuildQueryResult, RelationsFilter } from "drizzle-orm";
import { components, componentMigrations, playInputs, plays, queueStates, relations, playsHistorical } from "./schema/schema.js";
import {TSchema, TableName, Schema } from "./schema/schema.js";
import { MarkOptional, MarkRequired } from "ts-essentials";


export type ComponentNew = typeof components.$inferInsert;
export type ComponentSelect = GenericRelationResult<'components', 'migrations'>;

export type ComponentMigrationNew = typeof componentMigrations.$inferInsert;
export type ComponentMigrationSelect = typeof componentMigrations.$inferSelect;

export type QueueStateNew = typeof queueStates.$inferInsert;
export type QueueStateSelect = typeof queueStates.$inferSelect;

export type PlayInputNew = typeof playInputs.$inferInsert;
export type PlayInputSelect = typeof playInputs.$inferSelect;

export type PlaySelect = typeof plays.$inferSelect;
export type PlaySelectWithQueueStates = GenericRelationResult<'plays', 'queueStates'>;
export type PlayWith<K extends keyof TSchema['plays']["relations"]> = GenericRelationResult<'plays', K>;
export type PlayNew = typeof plays.$inferInsert;

export type PlayHistoricalSelect = typeof playsHistorical.$inferSelect;
export type PlayHistoricalNew = typeof playsHistorical.$inferInsert;

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
// https://github.com/drizzle-team/drizzle-orm/issues/5218#issuecomment-4154686086
export type WhereClause<T extends keyof typeof relations> = RelationsFilter<typeof relations[T], typeof relations>


export type CompareOp<T> = Pick<RelationFieldsFilterInternals<T>, 'gt' | 'gte' | 'eq' | 'lt' | 'lte' | 'ne'>
export type CompareOpKey<T> = keyof CompareOp<T>;

// all relations are are now fully typed and optional
//type FullPlay = ModelWithRelations<typeof plays>;

// https://github.com/drizzle-team/drizzle-orm/issues/695#issuecomment-4389296482
type GenericRelationResult<T extends keyof TSchema, K extends keyof TSchema[T]['relations']> = BuildQueryResult<TSchema, TSchema[T], { with: Record<K, true> }>;