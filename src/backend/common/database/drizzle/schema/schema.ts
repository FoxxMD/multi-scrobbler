import { integer, sqliteTable, text, index, uniqueIndex, customType, AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { defineRelations } from 'drizzle-orm';
import dayjs, { Dayjs } from "dayjs";
import { nanoid } from "nanoid";
import { ErrorLike, PlayObject } from "../../../../../core/Atomic.js";
import { asPlayCheap } from "../../../../../core/PlayMarshalUtils.js";
import { ExternalMetadataTerm, PlayTransformPartsConfig, SearchAndReplaceTerm } from "../../../infrastructure/Transform.js";
import { JobRangeCount, JobRangeTime } from "../../../infrastructure/Job.js";
import { serializeError } from "serialize-error";

const DayjsTimestamp = customType<
  {
    data: Dayjs;
    driverData: number;
  }
>({
  dataType() {
    return 'number'
  },
  toDriver(value: Dayjs): number {
    return value.valueOf();
  },
  fromDriver(value: number): Dayjs {
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
    return 'text'
  },
  toDriver(value: PlayObject): string {
    const {
      id,
      uid,
      ...rest
    } = value;
    return JSON.stringify(rest);
  },
  fromDriver(value: string): PlayObject {
    return asPlayCheap(JSON.parse(value));
  },
});

const ErrorLikeJson = customType<
  {
    data: ErrorLike;
    driverData: string;
  }
>({
  dataType() {
    return 'text'
  },
  toDriver(value: ErrorLike): string {
    return JSON.stringify(serializeError(value));
  },
  fromDriver(value: string): ErrorLike {
    return JSON.parse(value)
  },
});


export const plays = sqliteTable("plays", {
  id: integer().primaryKey(),
  uid: text({ length: 30 }).notNull().unique().$defaultFn(() => nanoid(20)),
  componentId: integer().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  error: ErrorLikeJson('error'),
  playedAt: DayjsTimestamp('playedAt'),
  seenAt: DayjsTimestamp('seenAt'),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()),
  play: PlayJson('play').notNull(), //  text({ mode: 'json' }).notNull().$type<PlayObject>(),
  state: text({enum: ['queued','discovered','discarded','scrobbled','failed','duped']}).notNull(),
  // https://orm.drizzle.team/docs/indexes-constraints#foreign-key
  parentId: integer().references((): AnySQLiteColumn => plays.id, {onDelete: 'set null', onUpdate: 'cascade'}),
  jobId: integer().references(() => jobs.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  playHash: text(),
  mbidIdentifier: text(),
  compacted: text()
}, (table) => [
  index("play_parent_id_idx").on(table.parentId),
  index("play_component_id_idx").on(table.componentId),
  uniqueIndex("play_uid_idx").on(table.uid),
  index("play_playedAt_idx").on(table.playedAt),
  index("play_seenAt_idx").on(table.seenAt)
]);

export const playInputs = sqliteTable("play_inputs", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  data: text({ mode: 'json' }).$type<object>(),
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

export const queueStates = sqliteTable("play_queue_states", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  componentId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  queueName: text({length: 50}).notNull(),
  queueStatus: text({enum: ['queued','completed','failed']}).notNull().default('queued'),
  retries: integer().notNull().default(0),
  error: ErrorLikeJson('error'),
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

export const components = sqliteTable("components", {
  id: integer({ mode: 'number' }).primaryKey(),
  // user-provided id
  uid: text({ length: 200 }).notNull(),
  mode: text({enum: ['source','client']}).notNull(),
  // spotify, lastfm, etc...
  type: text({length: 50}).notNull(),
  // vanity display name
  // used as uid if no user-provided id
  name: text().notNull(),
  // number of discovered/scrobbled plays found in real time
  countLive: integer().notNull().default(0),
  // number of discovered/scrobbled plays from backlog/jobs
  countNonLive: integer().notNull().default(0),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs())
},
(table) => [
  uniqueIndex('uid_mode_type_idx').on(table.uid,table.mode,table.type)
]);

export const componentMigrations = sqliteTable("component_migrations", {
  id: integer({ mode: 'number' }).primaryKey(),
  componentId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  name: text().notNull(),
  success: integer({mode: 'boolean'}),
  error: ErrorLikeJson('error'),
  attemptedAt: DayjsTimestamp('attemptedAt').notNull().$defaultFn(() => dayjs()),
});

export const jobs = sqliteTable("jobs", {
  id: integer({ mode: 'number' }).primaryKey(),
  componentFromId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  componentToId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  name: text({length: 50}).notNull(),
  status: text({enum: ['idle','completed','failed','processing']}).notNull().default('idle'),
  retries: integer().notNull().default(0),
  error: ErrorLikeJson('error'),
  transformOptions: text({ mode: 'json' }).$type<PlayTransformPartsConfig<SearchAndReplaceTerm[] | ExternalMetadataTerm>>(),
  initialParameters: text({ mode: 'json' }).$type<JobRangeCount | JobRangeTime>(),
  cursor: text({ mode: 'json' }),
  total: integer(),
  imported: integer().notNull().default(0),
  scrobbled: integer().notNull().default(0),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()),
  completedAt: DayjsTimestamp('completedAt')
});

const playRelations = defineRelations({ plays, queueStates, playInputs, components, jobs, componentMigrations }, (r) => ({
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
    migrations: r.many.componentMigrations(),
  },
  componentMigrations: {
    component: r.one.components({
      from: r.componentMigrations.componentId,
      to: r.components.id
    })
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
    case 'componentMigrations':
      return componentMigrations;
    case 'jobs':
      return jobs;
  }
}

const schema = {playInputs, plays, components, componentMigrations, queueStates, jobs};

export type TSchema = typeof relations;
export type Schema = typeof schema;
export type TableName = keyof TSchema;