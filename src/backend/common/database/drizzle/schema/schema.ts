import { integer, sqliteTable, text, index, uniqueIndex, customType, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { defineRelations } from 'drizzle-orm';
import dayjs, { type Dayjs } from "dayjs";
import { COMPONENT_TYPE_CLIENT, COMPONENT_TYPE_SOURCE, type ErrorLike, type QueueContext } from "../../../../../core/Atomic.ts";
import type { PlayObject } from "../../../../../core/PlaySchema.ts";
import { asPlay } from "../../../../../core/PlayMarshalUtils.ts";
import type {JobImportCursor, JobImportFile, JobTargetBreaker, JobTargetCursor, JobTargetStats, JobTransformSource} from "../../../infrastructure/Job.ts";
import { JOB_IMPORT_OVERLAPS, JOB_PROCESS_STATUSES, type MirrorSegment } from "../../../../../core/Job.ts";
import { serializeError, deserializeError } from "serialize-error";
import { generatePlayUid } from "../../../../../core/StringUtils.ts";
import { users, sessions, accounts, verifications, appSettings, apikeys, userSettings } from "./auth.ts";


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
    return asPlay(JSON.parse(value));
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
    return deserializeError(JSON.parse(value));
  },
});


export const plays = sqliteTable("plays", {
  id: integer().primaryKey(),
  uid: text({ length: 30 }).notNull().unique().$defaultFn(() => generatePlayUid()),
  componentId: integer().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  error: ErrorLikeJson('error'),
  playedAt: DayjsTimestamp('playedAt'),
  seenAt: DayjsTimestamp('seenAt'),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()).$onUpdate(() => dayjs()),
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
  // componentId first so it also serves componentId-only lookups
  index("play_component_played_idx").on(table.componentId, table.playedAt),
  uniqueIndex("play_uid_idx").on(table.uid),
  index("play_playedAt_idx").on(table.playedAt),
  index("play_seenAt_idx").on(table.seenAt),
  // covers job play counts per client and state without reading rows
  index("play_job_component_state_idx").on(table.jobId, table.componentId, table.state)
]);

export const playInputs = sqliteTable("play_inputs", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  data: text({ mode: 'json' }).$type<object>(),
  play: PlayJson('play').notNull(),//text({ mode: 'json' }).notNull().$type<PlayObject>(),
  playHash: text(),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs())
}, (table) => [
  uniqueIndex('play_input_id_idx').on(table.playId)
]);

/**
 * A set of scrobbles imported/mirrored into plays_historical, owned by a user.
 *
 * * service = 'mixed' => a user mirror. Any import (API or file, any service) can fill it
 * * any other service => locked to that service + account (IE a Teal/Rocksky client's history)
 * */
export const playMirrors = sqliteTable("play_mirrors", {
  id: integer().primaryKey(),
  userId: text().references(() => users.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  // 'mixed' for user mirrors, else the service a locked mirror belongs to
  service: text({length: 50}).notNull(),
  // upstream account of a locked mirror. null for user mirrors
  account: text({length: 200}),
  name: text().notNull(),
  // sorted, merged, inclusive [fromMs, toMs] ranges that are completely mirrored
  coverage: text({mode: 'json'}).$type<[number, number][]>().notNull().$defaultFn(() => []),
  // coverage split by what filled it. Sorted, non-overlapping, their union is coverage
  segments: text({mode: 'json'}).$type<MirrorSegment[]>().notNull().default([]),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()).$onUpdate(() => dayjs()),
}, (table) => [
  index('mirror_user_id_idx').on(table.userId),
  uniqueIndex('mirror_user_service_account_idx').on(table.userId, table.service, table.account)
]);

export const playsHistorical = sqliteTable("plays_historical", {
  id: integer().primaryKey(),
  uid: text({ length: 200 }).unique(),
  componentId: integer().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  playedAt: DayjsTimestamp('playedAt'),
  seenAt: DayjsTimestamp('seenAt'),
  play: PlayJson('play').notNull(),
  playHash: text(),
  mbidIdentifier: text(),
  mirrorId: integer().references(() => playMirrors.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  // dedupe key scheme of the import that created a mirror row (IE lastfm). null => created before origins were tracked
  origin: text({length: 50}),
  // 'input' once the raw upstream data in historical_play_inputs was removed
  compacted: text(),
}, (table) => [
  index("play_historical_component_id_idx").on(table.componentId),
  index("play_historical_mirror_played_idx").on(table.mirrorId, table.playedAt),
  uniqueIndex("play_historical_uid_idx").on(table.uid),
  index("play_historical_playedAt_idx").on(table.playedAt)
]);

/** Raw upstream data used to create a historical Play. Mirrors play_inputs for plays_historical */
export const historicalPlayInputs = sqliteTable("historical_play_inputs", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: integer().notNull().references(() => playsHistorical.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  data: text({ mode: 'json' }).$type<object>(),
  play: PlayJson('play').notNull(),
  playHash: text(),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs())
}, (table) => [
  uniqueIndex('historical_play_input_id_idx').on(table.playId)
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
  context: text({mode: 'json'}).$type<QueueContext & {isRetry?: boolean}>(),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()).$onUpdate(() => dayjs())
}, (table) => [
  index('play_queue_state_id_idx').on(table.playId),
  index('play_queue_state_component_idx').on(table.componentId, table.queueName, table.queueStatus)
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
  mode: text({enum: [COMPONENT_TYPE_SOURCE,COMPONENT_TYPE_CLIENT]}).notNull(),
  // spotify, lastfm, etc...
  type: text({length: 50}).notNull(),
  // vanity display name
  // used as uid if no user-provided id
  name: text().notNull(),
  // number of discovered/scrobbled plays found in real time
  countLive: integer().notNull().default(0),
  // number of discovered/scrobbled plays from backlog/jobs
  countNonLive: integer().notNull().default(0),
  // seconds of discovered plays (sources only), from listenedFor ?? duration
  listenedLive: integer().notNull().default(0),
  createdAt: DayjsTimestamp('createdAt').$defaultFn(() => dayjs()),
  lastReadyAt: DayjsTimestamp('lastReadyAt'),
  lastActiveAt: DayjsTimestamp('lastActiveAt'),
  // owner. Nullable at the SQL level only so the column could be added to existing databases, app always sets it.
  userId: text().references(() => users.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
},
(table) => [
  uniqueIndex('user_uid_mode_type_idx').on(table.userId, table.uid, table.mode, table.type),
  index('component_user_id_idx').on(table.userId)
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
  // owner. Nullable at the SQL level only so the column could be added to existing databases, app always sets it.
  userId: text().references(() => users.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  name: text({length: 100}).notNull(),
  // default NO ACTION (checked at end of statement) so a user delete can cascade through mirrors and jobs
  // while a direct mirror delete with referencing jobs still fails
  mirrorId: integer().notNull().references(() => playMirrors.id),
  // import origin. componentFromId and importFile both null => export from existing mirror data only
  // set null so deleting a component never deletes the job (and through plays.jobId, client history)
  componentFromId: integer().references(() => components.id, {onDelete: 'set null', onUpdate: 'cascade'}),
  importFile: text({ mode: 'json' }).$type<JobImportFile>(),
  // null => beginning of time
  rangeFrom: DayjsTimestamp('rangeFrom'),
  // frozen at creation
  rangeTo: DayjsTimestamp('rangeTo').notNull(),
  // create historical_play_inputs for mirror rows this job inserts
  persistInputs: integer({mode: 'boolean'}).notNull().default(true),
  // what the import does where the mirror already has data in the job's range
  importOverlap: text({enum: JOB_IMPORT_OVERLAPS}).notNull().default('skip'),
  // replace: when the mirror plays in the job's range were deleted. Set once, so a resumed import never deletes its own plays
  importReplacedAt: DayjsTimestamp('importReplacedAt'),
  exportOrder: text({enum: ['asc','desc']}).notNull().default('desc'),
  // export only sends more plays while a target client's queue (all plays) is shorter than this
  exportQueueLimit: integer().notNull().default(20),
  // false => target clients skip fetching their service's scrobbles for the dupe check and only compare against their own db
  exportUpstreamCheck: integer({mode: 'boolean'}).notNull().default(true),
  // raw stage config snapshot (always a list), parsed again when exporting
  transformOptions: text({ mode: 'json' }).$type<unknown[]>(),
  transformSource: text({ mode: 'json' }).$type<JobTransformSource>(),
  importStatus: text({enum: JOB_PROCESS_STATUSES}).notNull().default('idle'),
  importCursor: text({ mode: 'json' }).$type<JobImportCursor>(),
  importTotal: integer(),
  // records received from the import provider
  importFetched: integer().notNull().default(0),
  // records newly inserted into the mirror
  imported: integer().notNull().default(0),
  importError: ErrorLikeJson('importError'),
  importStartedAt: DayjsTimestamp('importStartedAt'),
  importCompletedAt: DayjsTimestamp('importCompletedAt'),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()).$onUpdate(() => dayjs()),
}, (table) => [
  index('job_user_id_idx').on(table.userId),
  index('job_mirror_id_idx').on(table.mirrorId),
]);

/** One export of a job to one Client */
export const jobTargets = sqliteTable("job_targets", {
  id: integer({ mode: 'number' }).primaryKey(),
  jobId: integer().notNull().references(() => jobs.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  // the Client exported to
  componentId: integer().notNull().references(() => components.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  status: text({enum: JOB_PROCESS_STATUSES}).notNull().default('idle'),
  // null => nothing exported yet
  cursor: text({ mode: 'json' }).$type<JobTargetCursor>(),
  // mirror rows queued to the client
  exported: integer().notNull().default(0),
  // plays the client created from them (some may be skipped as already queued/scrobbled)
  queued: integer().notNull().default(0),
  stats: text({ mode: 'json' }).$type<JobTargetStats>(),
  // plays per state that a cleanup deleted from the client. Added to live stats so exports keep their numbers
  removedStats: text({ mode: 'json' }).$type<JobTargetStats>(),
  error: ErrorLikeJson('error'),
  breaker: text({ mode: 'json' }).$type<JobTargetBreaker>().notNull().$defaultFn(() => ({failedInARow: 0})),
  startedAt: DayjsTimestamp('startedAt'),
  completedAt: DayjsTimestamp('completedAt'),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
  updatedAt: DayjsTimestamp('updatedAt').notNull().$defaultFn(() => dayjs()).$onUpdate(() => dayjs()),
}, (table) => [
  uniqueIndex('job_target_job_component_idx').on(table.jobId, table.componentId),
  index('job_target_component_id_idx').on(table.componentId),
]);

export const playEvents = sqliteTable("play_events", {
  id: integer({ mode: 'number' }).primaryKey(),
  playId: integer().notNull().references(() => plays.id, {onDelete: 'cascade', onUpdate: 'cascade'}),
  eventName: text({length: 50}).notNull(),
  data: text({ mode: 'json' }),
  error: ErrorLikeJson('error'),
  createdAt: DayjsTimestamp('createdAt').notNull().$defaultFn(() => dayjs()),
}, (table) => [
  index('play_event_id_idx').on(table.playId)
]);

const playRelations = defineRelations({ plays, queueStates, playEvents, playInputs, components, jobs, componentMigrations, playsHistorical, historicalPlayInputs, playMirrors, jobTargets, users, sessions, accounts, verifications, appSettings, apikeys, userSettings }, (r) => ({
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
    }),
    events: r.many.playEvents(),
  },
  playsHistorical: {
    component: r.one.components({
      from: r.playsHistorical.componentId,
      to: r.components.id,
    }),
    mirror: r.one.playMirrors({
      from: r.playsHistorical.mirrorId,
      to: r.playMirrors.id,
    }),
    input: r.one.historicalPlayInputs({
      from: r.playsHistorical.id,
      to: r.historicalPlayInputs.playId,
      optional: true,
    }),
  },
  playMirrors: {
    plays: r.many.playsHistorical(),
    jobs: r.many.jobs(),
    user: r.one.users({
      from: r.playMirrors.userId,
      to: r.users.id,
    }),
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
    playsHistorical: r.many.playsHistorical(),
    queueStates: r.many.queueStates(),
    migrations: r.many.componentMigrations(),
    user: r.one.users({
      from: r.components.userId,
      to: r.users.id,
    }),
  },
  componentMigrations: {
    component: r.one.components({
      from: r.componentMigrations.componentId,
      to: r.components.id
    })
  },
  jobs: {
    plays: r.many.plays(),
    targets: r.many.jobTargets(),
    mirror: r.one.playMirrors({
      from: r.jobs.mirrorId,
      to: r.playMirrors.id,
    }),
    componentFrom: r.one.components({
      from: r.jobs.componentFromId,
      to: r.components.id,
      optional: true,
    }),
    user: r.one.users({
      from: r.jobs.userId,
      to: r.users.id,
    }),
  },
  jobTargets: {
    job: r.one.jobs({
      from: r.jobTargets.jobId,
      to: r.jobs.id,
    }),
    component: r.one.components({
      from: r.jobTargets.componentId,
      to: r.components.id,
    }),
  },
  playEvents: {
    play: r.one.plays({
      from: r.playEvents.playId,
      to: r.plays.id
    }),
  },
  users: {
    sessions: r.many.sessions({
      from: r.users.id,
      to: r.sessions.userId,
    }),
    accounts: r.many.accounts({
      from: r.users.id,
      to: r.accounts.userId,
    }),
    components: r.many.components(),
    jobs: r.many.jobs(),
    apikeys: r.many.apikeys({
      from: r.users.id,
      to: r.apikeys.referenceId,
    }),
  },
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    })
  },
  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    })
  },
  apikeys: {
    user: r.one.users({
      from: r.apikeys.referenceId,
      to: r.users.id,
    })
  },
}));

export const relations = playRelations;

export const getConfigByTableName = <T extends TableName>(name: T) => {
  switch(name) {
    case 'plays':
      return plays;
    case 'playsHistorical':
      return playsHistorical;
    case 'components':
      return components;
    case 'playInputs':
      return playInputs;
    case 'playEvents':
      return playEvents;
    case 'queueStates':
      return queueStates;
    case 'componentMigrations':
      return componentMigrations;
    case 'jobs':
      return jobs;
    case 'playMirrors':
      return playMirrors;
    case 'jobTargets':
      return jobTargets;
    case 'historicalPlayInputs':
      return historicalPlayInputs;
  }
}

export const schema = {playInputs, plays, playEvents, components, componentMigrations, queueStates, jobs};

export type TSchema = typeof relations;
export type Schema = typeof schema;
/** App (non-auth) tables managed through MS repositories */
export type TableName = Exclude<keyof TSchema, 'users' | 'sessions' | 'accounts' | 'verifications' | 'appSettings' | 'apikeys' | 'userSettings'>;