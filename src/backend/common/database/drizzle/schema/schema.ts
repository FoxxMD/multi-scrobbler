import { integer, sqliteTable, text, index, uniqueIndex, customType, AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { defineRelations } from 'drizzle-orm';
import dayjs, { Dayjs } from "dayjs";
import { nanoid } from "nanoid";
import { ErrorLike, PlayObject } from "../../../../../core/Atomic.js";

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

export const plays = sqliteTable("plays", {
  id: integer().primaryKey(),
  uid: text({ length: 30 }).notNull().unique().$defaultFn(() => nanoid(20)),
  componentId: integer().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  error: text({ mode: 'json' }).$type<ErrorLike>(),
  playedAt: DayjsTimestamp('playedAt'),
  seenAt: DayjsTimestamp('seenAt'),
  play: text({ mode: 'json' }).notNull().$type<PlayObject>(),
  state: text({enum: ['queued','discovered','scrobbled','failed','duped']}).notNull(),
  // https://orm.drizzle.team/docs/indexes-constraints#foreign-key
  parentId: integer().references((): AnySQLiteColumn => plays.id, {onDelete: 'set null', onUpdate: 'cascade'}),
  compacted: text()
}, (table) => [
  index("play_parent_id_idx").on(table.parentId),
  index("play_component_id_idx").on(table.componentId),
  uniqueIndex("play_uid_idx").on(table.uid),
  index("play_playedAt_idx").on(table.playedAt),
  index("play_seenAt_idx").on(table.seenAt),
]);

export const playInputs = sqliteTable("play_inputs", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  data: text({ mode: 'json' }).$type<object>(),
  play: text({ mode: 'json' }).notNull().$type<PlayObject>(),
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
  error: text({ mode: 'json' }).$type<ErrorLike>(),
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

const playRelations = defineRelations({ plays, queueStates, playInputs, components }, (r) => ({
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
  }
}));

export const relations = playRelations;

export const getConfigByTableName = (name: TableName) => {
  switch(name) {
    case 'plays':
      return plays;
    case 'components':
      return components;
    case 'playInputs':
      return playInputs;
    case 'queueStates':
      return queueStates;
  }
}

const schema = {playInputs, plays, components, queueStates};

export type TSchema = typeof relations;
export type Schema = typeof schema;
export type TableName = keyof TSchema;