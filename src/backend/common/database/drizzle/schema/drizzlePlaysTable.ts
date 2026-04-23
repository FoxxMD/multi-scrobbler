import { integer, sqliteTable, text, index, customType, AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { defineRelations } from 'drizzle-orm';
import dayjs, { Dayjs } from "dayjs";

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
  id: text({ length: 30 }).primaryKey(),
  componentType: text({ length: 50 }).notNull(),
  componentName: text({ length: 200 }).notNull(),
  error: text({ mode: 'json' }),
  playedAt: DayjsTimestamp('playedAt'), // integer({ mode: 'timestamp_ms' }),
  seenAt: DayjsTimestamp('seenAt'), // integer({ mode: 'timestamp_ms' }),
  play: text({ mode: 'json' }).notNull(),
  // https://orm.drizzle.team/docs/indexes-constraints#foreign-key
  parentId: text({ length: 30 }).references((): AnySQLiteColumn => plays.id)
}, (table) => [
  index("play_parent_id_idx").on(table.parentId),
  index("play_playedAt_idx").on(table.playedAt),
  index("play_seenAt_idx").on(table.seenAt),
]);

export type NewPlay = typeof plays.$inferInsert;
export type SelectPlay = typeof plays.$inferSelect;

export const playInputs = sqliteTable("play_inputs", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: text({ length: 30 }).references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  data: text({ mode: 'json' }),
  play: text({ mode: 'json' }),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs()) // integer({ mode: 'timestamp_ms' })
}, (table) => [
  index('play_input_id_idx').on(table.playId)
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

export const queueStates = sqliteTable("play_queue_state", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: text().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  queueName: text({length: 200}),
  queueStatus: text({length: 30}),
  error: text({ mode: 'json' }),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs()) // integer({ mode: 'timestamp_ms' })
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

export const playRelations = defineRelations({ plays, queueStates, playInputs }, (r) => ({
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
    children: r.many.plays()
  },
  queueStates: {
    play: r.one.plays({
      from: r.queueStates.playId,
      to: r.plays.id
    })
  }
}));

export const relations = playRelations;