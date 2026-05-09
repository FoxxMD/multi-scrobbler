import { integer, serial as primaryInt, pgTable as table, text, varchar, json, index, uniqueIndex, customType, AnyPgColumn, timestamp } from "drizzle-orm/pg-core";
import { defineRelations } from 'drizzle-orm';
import dayjs, { Dayjs } from "dayjs";
import { nanoid } from "nanoid";
import { ErrorLike, PlayObject } from "../../../../../core/Atomic.js";
import { asPlayCheap } from "../../../../../core/PlayMarshalUtils.js";
import { ExternalMetadataTerm, PlayTransformPartsConfig, SearchAndReplaceTerm } from "../../../infrastructure/Transform.js";
import { JobRangeCount, JobRangeTime } from "../../../infrastructure/Job.js";

const DayjsTimestamp = customType<
  {
    data: Dayjs;
    driverData: string;
  }
>({
  dataType() {
    return 'timestamp'
  },
  toDriver(value: Dayjs): string {
    return value.toISOString();
  },
  fromDriver(value: string): Dayjs {
    return dayjs(value);
  },
});

const PlayJson = customType<
  {
    data: PlayObject;
    driverData: string;
  }
>({
  dataType() {
    return 'jsonb'
  },
  toDriver(value: PlayObject): string {
    const {
      // meta: {
      //   // dbId,
      //   // dbUid,
      //   ...metaRest
      // },
      id,
      uid,
      ...rest
    } = value;
    return JSON.stringify(rest);
  },
  fromDriver(value: any): PlayObject {
    return asPlayCheap(value);
  },
});


export const plays = table("plays", {
  id: primaryInt().primaryKey(),
  uid: varchar({ length: 30 }).notNull().unique().$defaultFn(() => nanoid(20)),
  componentId: integer().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  error: json().$type<ErrorLike>(),
  playedAt: DayjsTimestamp('playedAt'),
  seenAt: DayjsTimestamp('seenAt'),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()),
  play: PlayJson('play').notNull(), //  text({ mode: 'json' }).notNull().$type<PlayObject>(),
  state: varchar({enum: ['queued','discovered','discarded','scrobbled','failed','duped'], length: 20}).notNull(),
  // https://orm.drizzle.team/docs/indexes-constraints#foreign-key
  parentId: integer().references((): AnyPgColumn => plays.id, {onDelete: 'set null', onUpdate: 'cascade'}),
  jobId: integer().references(() => jobs.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  playHash: varchar({length: 100}),
  mbidIdentifier: varchar({length: 100}),
  compacted: varchar({length: 30})
}, (table) => [
  index("play_parent_id_idx").on(table.parentId),
  index("play_component_id_idx").on(table.componentId),
  uniqueIndex("play_uid_idx").on(table.uid),
  index("play_playedAt_idx").on(table.playedAt),
  index("play_seenAt_idx").on(table.seenAt)
]);

export const playInputs = table("play_inputs", {
  id: primaryInt().primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  data: json().$type<object>(),
  play: PlayJson('play').notNull(),//text({ mode: 'json' }).notNull().$type<PlayObject>(),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs())
}, (table) => [
  uniqueIndex('play_input_id_idx').on(table.playId)
]);

// export const playParentRelations = defineRelations({plays}, (r) => ({
//   plays: {
//     parent: r.one.plays({
//       from: r.plays.parentId,
//       to: r.plays.id
//     }),
//     children: r.many.plays()
//   }
// }))


// export const playInputRelations = defineRelations({ plays, playInputs }, (r) => ({
//   plays: {
//     input: r.one.playInputs({
//       from: r.plays.id,
//       to: r.playInputs.playId,
//       optional: false,
//     })
//   }
// }));

export const queueStates = table("play_queue_states", {
  id: primaryInt().primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  componentId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  queueName: varchar({length: 50}).notNull(),
  queueStatus: varchar({enum: ['queued','completed','failed'], length: 20}).notNull().default('queued'),
  retries: integer().notNull().default(0),
  error: json().$type<ErrorLike>(),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs())
}, (table) => [
  index('play_queue_state_id_idx').on(table.playId)
]);

// export const playQueueRelations = defineRelations({ plays, queueStates }, (r) => ({
//   plays: {
//     queueStates: r.many.queueStates()
//   },
//   queueStates: {
//     play: r.one.plays({
//       from: r.queueStates.playId,
//       to: r.plays.id
//     })
//   }
// }));

export const components = table("components", {
  id: primaryInt().primaryKey(),
  // user-provided id
  uid: varchar({ length: 200 }).notNull(),
  mode: varchar({enum: ['source','client'], length: 15}).notNull(),
  // spotify, lastfm, etc...
  type: varchar({length: 50}).notNull(),
  // vanity display name
  // used as uid if no user-provided id
  name: varchar().notNull(),
  // number of discovered/scrobbled plays found in real time
  countLive: integer().notNull().default(0),
  // number of discovered/scrobbled plays from backlog/jobs
  countNonLive: integer().notNull().default(0),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs())
},
(table) => [
  uniqueIndex('uid_mode_type_idx').on(table.uid,table.mode,table.type)
]);

export const jobs = table("jobs", {
  id: primaryInt().primaryKey(),
  componentFromId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  componentToId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  name: varchar({length: 200}).notNull(),
  status: varchar({enum: ['idle','completed','failed','processing'], length: 20}).notNull().default('idle'),
  retries: integer().notNull().default(0),
  error: json().$type<ErrorLike>(),
  transformOptions: json().$type<PlayTransformPartsConfig<SearchAndReplaceTerm[] | ExternalMetadataTerm>>(),
  initialParameters: json().$type<JobRangeCount | JobRangeTime>(),
  cursor: json(),
  total: integer(),
  imported: integer().notNull().default(0),
  scrobbled: integer().notNull().default(0),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()),
  completedAt: DayjsTimestamp('completedAt')
});

const playRelations = defineRelations({ plays, queueStates, playInputs, components, jobs }, (r) => ({
  plays: {
    queueStates: r.many.queueStates(),
    input: r.one.playInputs({
      from: r.plays.id,
      to: r.playInputs.playId,
      optional: false,
    }),
    parent: r.one.plays({
      from: r.plays.parentId,
      to: r.plays.id
    }),
    children: r.many.plays(),
    component: r.one.components({
      from: r.plays.componentId,
      to: r.components.id,
      optional: true
    }),
    job: r.one.jobs({
      from: r.plays.jobId,
      to: r.jobs.id,
      optional: true
    })
  },
  queueStates: {
    play: r.one.plays({
      from: r.queueStates.playId,
      to: r.plays.id
    }),
    component: r.one.components({
      from: r.queueStates.componentId,
      to: r.components.id
    })
  },
  components: {
    plays: r.many.plays(),
    queueStates: r.many.queueStates(),
  },
  jobs: {
    plays: r.many.plays()
  }
}));

export const relations = playRelations;

export const getConfigByTableName = <T extends TableName>(name: T) => {
  switch(name) {
    case 'plays':
      return plays;
    case 'components':
      return components;
    case 'playInputs':
      return playInputs;
    case 'queueStates':
      return queueStates;
    case 'jobs':
      return jobs;
  }
}

const schema = {playInputs, plays, components, queueStates, jobs};

export type TSchema = typeof relations;
export type Schema = typeof schema;
export type TableName = keyof TSchema;