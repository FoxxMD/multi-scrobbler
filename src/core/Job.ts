import * as z from "zod";
import type { ErrorObject } from "serialize-error";
import type { RateLimitStatusJson } from "./RateLimit.ts";
import type { PlayApiCommon } from "./Api.ts";

/**
 * Status of a job process (import, or export to one target).
 *
 * `paused` and `stopped` behave the same (halted, cursor kept, Start resumes) and only differ for display.
 * */
export const JOB_PROCESS_STATUSES = ['idle', 'running', 'paused', 'stopped', 'failed', 'completed'] as const;
export type JobProcessStatus = typeof JOB_PROCESS_STATUSES[number];

/**
 * What an import does where its mirror already has data in the job's range.
 *
 * * skip => only import time the mirror doesn't cover yet
 * * replace => delete the mirror's plays in the job's exact range first, then import all of it
 * */
export const JOB_IMPORT_OVERLAPS = ['skip', 'replace'] as const;
export type JobImportOverlap = typeof JOB_IMPORT_OVERLAPS[number];

/** play_mirrors.service of a user mirror. Any other service means the mirror is locked to that service + account */
export const MIRROR_SERVICE_MIXED = 'mixed';

export const isLockedMirror = (mirror: {service: string}): boolean => mirror.service !== MIRROR_SERVICE_MIXED;

/** Part of a mirror's coverage and what filled it */
export interface MirrorSegment {
    /** inclusive unix ms */
    range: [number, number]
    /** dedupe key scheme of the import (IE lastfm, lastfm-benjamin). 'unknown' => filled before origins were tracked */
    origin: string
    /** job that imported it. null => unknown or the job was deleted */
    jobId: number | null
}

export const LASTFM_FILE_FORMATS = ['lastfm-ghan-json', 'lastfm-ghan-csv', 'lastfm-benjamin-csv'] as const;
export type LastfmFileFormat = typeof LASTFM_FILE_FORMATS[number];


/** Runtime state of a process, not persisted */
export interface JobProcessRuntimeJson {
    waiting?: string
    retryAttempt?: number
    nextRetryAt?: string
    progress?: number
    /** the export Client's rate limit, when it reports one */
    rateLimit?: RateLimitStatusJson
    /** the export waits for an Epoch Play decision (epochDecision): the Client's scrobbles before 2 Jan 1970, at most EPOCH_CHECK_MAX. null => the Client can't check */
    epochPlays?: number | null
}

export type JobImportOriginJson = { kind: 'component', componentId: number | null, name?: string }
    | { kind: 'file', originalName: string, format: LastfmFileFormat, size: number }
    | { kind: 'mirror' };

export const JOB_EXPORT_ORDERS = ['asc', 'desc'] as const;
export type JobExportOrder = typeof JOB_EXPORT_ORDERS[number];

export const EXPORT_QUEUE_LIMIT_DEFAULT = 20;
export const EXPORT_QUEUE_LIMIT_MAX = 1000;

/** Export of a job's mirror plays to one Client */
export interface JobTargetApiJson {
    id: number
    componentId: number
    /** undefined if the Client is no longer configured */
    name?: string
    type?: string
    status: JobProcessStatus
    /** last exported mirror play, playedAt is unix ms. null => nothing exported yet */
    cursor: { playedAt: number, id: number } | null
    /** mirror plays sent to the client */
    exported: number
    /** client plays created from them, the rest were already queued or scrobbled */
    queued: number
    /** mirror plays not sent because of the job's data issue options */
    skipped: number
    /** exportKeepEpochBursts: null => the Client was not checked for scrobbles before 2 Jan 1970 yet, empty => it had none, send/skip => the user's choice when it had some */
    epochDecision: EpochDecision | null
    /** the job's client plays by state, including ones a cleanup deleted. Frozen once completed */
    stats: Partial<Record<string, number>> | null
    /** the job's client plays in the Client right now */
    records: number
    error: ErrorObject | null
    breaker: { failedInARow: number, trippedAt?: number }
    startedAt: string | null
    completedAt: string | null
    updatedAt: string
}

/** Where a job's transforms were copied from. The stages themselves are a snapshot taken at creation */
export type JobTransformSource = { kind: 'preset', name: string }
    | { kind: 'component', componentId: number, componentName: string, hook: 'preCompare' | 'postCompare' };

export interface JobApiJson {
    id: number
    name: string
    /** overall status derived from its processes */
    status: JobProcessStatus
    mirror: { id: number, name: string, service: string, account: string | null, locked: boolean }
    importFrom: JobImportOriginJson
    rangeFrom: string | null
    rangeTo: string
    persistInputs: boolean
    importOverlap: JobImportOverlap
    /** replace: when the mirror plays in the job's range were deleted. null => not yet (or skip) */
    importReplacedAt: string | null
    /** transform stages applied to exported plays, null => none */
    transformOptions: unknown[] | null
    transformSource: JobTransformSource | null
    exportOrder: JobExportOrder
    /** the export only sends more plays while a target client's queue (live plays included) holds fewer than this */
    exportQueueLimit: number
    /** false => clients don't fetch their service's scrobbles to find duplicates, only plays they already have in the database */
    exportUpstreamCheck: boolean
    /** true => plays a job transform discarded are kept in clients in the discarded state, false => they are not sent */
    exportDiscarded: boolean
    /** true => plays with a bad timestamp are not sent */
    exportSkipBadTimestamps: boolean
    /** true => only the first play of each burst (in export order) is sent. Waits for the import to finish */
    exportCollapseBursts: boolean
    /** with exportCollapseBursts: bursts of Epoch Plays are sent whole, and Epoch Plays are sent without a dupe check */
    exportKeepEpochBursts: boolean
    targets: JobTargetApiJson[]
    /** mirror plays in the job's range, what an export will go through */
    mirrorPlaysInRange: number
    importStatus: JobProcessStatus
    importCursor: unknown
    importTotal: number | null
    importFetched: number
    imported: number
    importError: ErrorObject | null
    importStartedAt: string | null
    importCompletedAt: string | null
    createdAt: string
    updatedAt: string
    /** exports are keyed by target id */
    runtime: {
        import: JobProcessRuntimeJson
        exports: Record<string, JobProcessRuntimeJson>
        /** a cleanup of the job's scrobbles in its Clients is running */
        cleanup?: JobCleanupProgressJson
        /** the job is being deleted */
        deleting?: boolean
    }
}

/** Timings and counts to troubleshoot a slow Job, copied by the user into a bug report */
export interface JobMetricsApiJson {
    generatedAt: string
    version?: string
    uptimeSeconds: number
    process: {memory: Record<string, number>, cpu: Record<string, number>}
    job: {id: number, status: string, importStatus: string, exportOrder: string, exportQueueLimit: number, exportUpstreamCheck: boolean, mirrorPlaysInRange: number}
    /** `metricName` is the `name` label of the Client's metrics */
    targets: {componentId: number, name?: string, metricName?: string, status: string, exported: number, queued: number, stats: Partial<Record<string, number>> | null, clientPlays: number}[]
    /** prom-client metrics filtered to this Job and its Clients */
    metrics: {name: string, help: string, type: string, values: {labels: Record<string, string | number>, value: number, metricName?: string}[]}[]
}

/** Average seconds per Play since startup, undefined if nothing was measured yet */
export interface JobExportTimings {
    /** reading, transforming and queueing a Play, plus processing it in the Client and saving the result. Excludes time waiting in the queue */
    perPlay?: number
    /** reading a Play from the Mirror, the Job's transforms, and adding it to the Client queue */
    mirrorToQueue?: number
    /** from taking the Play off the queue until just before the request to the service (transforms, duplicate checks) */
    clientProcessing?: number
    /** the request to the Client's service */
    scrobbleRequest?: number
}

export const jobExportTimings = (data: JobMetricsApiJson, metricName: string): JobExportTimings => {
    const job = String(data.job.id);
    const totals = (metric: string, stage: string, labels: Record<string, string>) => {
        let sum = 0;
        let count = 0;
        for (const v of data.metrics.find(m => m.name === metric)?.values ?? []) {
            if (v.labels.stage !== stage || v.labels.name !== metricName || Object.entries(labels).some(([k, val]) => String(v.labels[k]) !== val)) {
                continue;
            }
            if (v.metricName === `${metric}_sum`) {
                sum += v.value;
            } else if (v.metricName === `${metric}_count`) {
                count += v.value;
            }
        }
        return {sum, count};
    }
    const play = (stage: string, jobLabel = job) => totals('multiscrobbler_play_stage_seconds', stage, {mode: 'client', job: jobLabel});
    const avg = (t: {sum: number, count: number}) => t.count === 0 ? undefined : t.sum / t.count;

    const processTotal = play('process_total');
    const scrobble = play('scrobble_request');
    // the queue is read before the Play is known, so this is the Client's average for live and export Plays
    const queueNext = avg(play('queue_next', ''));
    // process_total includes the request, so take its total out
    const clientProcessing = processTotal.count === 0 ? undefined : (processTotal.sum - scrobble.sum) / processTotal.count + (queueNext ?? 0);

    // a pass queues a page of Plays, each Play queued runs one pre_queue_check
    const passes = totals('multiscrobbler_export_stage_seconds', 'pass', {job});
    const queued = play('pre_queue_check');
    const mirrorToQueue = queued.count === 0 ? undefined : passes.sum / queued.count;
    const processAvg = avg(processTotal);
    const persistAvg = avg(play('persist'));
    const perPlay = mirrorToQueue === undefined || processAvg === undefined ? undefined : mirrorToQueue + processAvg + (queueNext ?? 0) + (persistAvg ?? 0);

    return {perPlay, mirrorToQueue, clientProcessing, scrobbleRequest: avg(scrobble)};
}

export const CLEANUP_ACTIONS = ['compact', 'delete'] as const;
export type CleanupAction = typeof CLEANUP_ACTIONS[number];

/** Progress of a running cleanup */
export interface JobCleanupProgressJson {
    action: CleanupAction
    /** the Client being cleaned up right now */
    componentId?: number
    done: number
    total: number
}

/** A cleanup or delete running on a mirror */
export interface MirrorTaskJson {
    kind: 'cleanup' | 'delete'
    action?: CleanupAction
    /** inclusive unix ms. undefined => the whole mirror */
    range?: [number, number]
    done: number
    total: number
    startedAt: string
}

export interface MirrorApiJson {
    id: number
    name: string
    service: string
    account: string | null
    /** only takes scrobbles from its own service + account, can't be imported into */
    locked: boolean
    /** completely mirrored time ranges, inclusive unix ms */
    coverage: [number, number][]
    /** coverage split by what filled it */
    segments: MirrorSegment[]
    /** holes between the first and last covered time */
    gaps: [number, number][]
    plays: number
    jobs: { id: number, name: string }[]
    task: MirrorTaskJson | null
    createdAt: string
    updatedAt: string
}

/** Mirror Plays timestamped before this (unix ms, 1970-01-02) have an invalid timestamp. Last.fm files them under 01 Jan 1970 when it got no date */
export const BAD_TIMESTAMP_BEFORE_MS = 86_400_000;
/** Plays of the same track and artists at most this far apart (ms) are in one burst. Real repeat listens are a track length apart */
export const BURST_MAX_GAP_MS = 2000;
/** fewest Plays in a burst */
export const BURST_MIN_PLAYS = 3;

/** Mirror Plays timestamped more than this (ms) after their row was created (seenAt, when imported) have an invalid timestamp */
export const BAD_TIMESTAMP_FUTURE_MS = 86_400_000;

/** Mirror play is timestamped before BAD_TIMESTAMP_BEFORE_MS. Onboarding bursts (play counts copied from older software) are here */
export const isEpochPlay = (playedAt: number): boolean => playedAt < BAD_TIMESTAMP_BEFORE_MS;

/** What an export with exportKeepEpochBursts does with Epoch Plays for one target. empty => the Client had no scrobbles before 2 Jan 1970, send/skip => the user's choice when it had some */
export const EPOCH_DECISIONS = ['empty', 'send', 'skip'] as const;
/** The Epoch Play check stops counting a Client's scrobbles before 2 Jan 1970 here */
export const EPOCH_CHECK_MAX = 100;
export type EpochDecision = typeof EPOCH_DECISIONS[number];

/** Mirror play timestamp is invalid. Same rule as the data issue detector (mirrorIssueRuns) */
export const isBadTimestamp = (playedAt: number, seenAt: number | null): boolean => playedAt < BAD_TIMESTAMP_BEFORE_MS || (seenAt !== null && playedAt > seenAt + BAD_TIMESTAMP_FUTURE_MS);

export const MIRROR_ISSUE_TAGS = ['badTimestamp', 'burst'] as const;
export type MirrorIssueTag = typeof MIRROR_ISSUE_TAGS[number];

/** Counts of suspicious Plays in a mirror, found when read. Nothing is changed */
export interface MirrorIssueSummaryJson {
    /** Plays timestamped before BAD_TIMESTAMP_BEFORE_MS, or more than BAD_TIMESTAMP_FUTURE_MS after they were imported */
    badTimestamp: number
    bursts: number
    /** Plays in bursts */
    burstPlays: number
    /** distinct Plays with any issue */
    plays: number
}

/** A MirrorIssueGroup as read from the database */
export interface MirrorIssueGroupRow {
    /** id of the group's first Play */
    id: number
    count: number
    /** Plays in the group with a bad timestamp */
    bad: number
    firstPlayedAt: number
    lastPlayedAt: number
}

/** Tags and summary of issue groups. Pure, so the backend can cache the rows */
export const issueGroupTags = (row: Pick<MirrorIssueGroupRow, 'count' | 'bad'>): MirrorIssueTag[] => [
    ...(row.bad > 0 ? ['badTimestamp' as const] : []),
    ...(row.count >= BURST_MIN_PLAYS ? ['burst' as const] : []),
];

export const summarizeIssueGroups = (rows: Pick<MirrorIssueGroupRow, 'count' | 'bad'>[]): MirrorIssueSummaryJson => {
    const summary: MirrorIssueSummaryJson = {badTimestamp: 0, bursts: 0, burstPlays: 0, plays: 0};
    for (const row of rows) {
        summary.badTimestamp += row.bad;
        summary.plays += row.count;
        if (row.count >= BURST_MIN_PLAYS) {
            summary.bursts++;
            summary.burstPlays += row.count;
        }
    }
    return summary;
}

/** One burst, or one Play with a bad timestamp that is not in a burst */
export interface MirrorIssueGroup<P = unknown> {
    tags: MirrorIssueTag[]
    count: number
    /** unix ms */
    firstPlayedAt: number
    /** unix ms */
    lastPlayedAt: number
    /** the first Play of the group */
    play: P
}

export type MirrorIssueGroupJson = MirrorIssueGroup<PlayApiCommon['play']>;

// '' (IE `from=`) would coerce to 0
const optionalMs = z.preprocess(x => x === '' ? undefined : x, z.coerce.number().int().optional());
const issueRangeSchema = z.object({
    from: optionalMs.meta({description: 'Only Plays played at or after this unix ms timestamp'}),
    to: optionalMs.meta({description: 'Only Plays played at or before this unix ms timestamp'}),
});
export const mirrorIssuesQuerySchema = issueRangeSchema.refine(x => x.from === undefined || x.to === undefined || x.from <= x.to, {message: 'from must not be after to'});
export const mirrorIssueListQuerySchema = issueRangeSchema.extend({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(200).default(50),
}).refine(x => x.from === undefined || x.to === undefined || x.from <= x.to, {message: 'from must not be after to'});

/** undefined when neither edge is given */
export const issueQueryRange = (q: {from?: number, to?: number}): [number, number] | undefined => q.from === undefined && q.to === undefined
    ? undefined
    : [q.from ?? Number.MIN_SAFE_INTEGER, q.to ?? Number.MAX_SAFE_INTEGER];

/** Plays import jobs created in a Client */
export interface ClientJobPlaysSummaryJson {
    total: number
    /** still in the Client's queue. Client-wide cleanups skip these */
    queued: number
    /** of jobs that were deleted */
    orphaned: number
    /** raw data already removed */
    compacted: number
    /** Jobs exporting to the Client right now. A cleanup has to wait until they stop */
    exportingJobs: { id: number, name: string }[]
    task: JobCleanupProgressJson | null
}

export interface JobOptionsApiJson {
    importComponents: { componentId: number, name: string, mode: 'source' | 'client', ready: boolean, account: string | null }[]
    /** locked mirrors can only be exported from (importFrom.mirrorId) */
    mirrors: { id: number, name: string, service: string, account: string | null, locked: boolean, coverage: [number, number][], playCount: number }[]
    /** files placed in the data directory's imports folder that no job uses yet */
    importFiles: { name: string, size: number, modifiedAt: string }[]
    /** Clients a job can export to. rejectsOldScrobbles => the service refuses scrobbles older than ~14 days (Last.fm-type) */
    targets: { componentId: number, name: string, type: string, ready: boolean, rejectsOldScrobbles: boolean }[]
    /** transformersPresets from the config, by name */
    presets: { name: string, stages: unknown[] }[]
    /** Sources/Clients whose playTransform stages can be copied into a job */
    componentTransforms: { componentId: number, name: string, mode: 'source' | 'client', preCompare?: unknown[], postCompare?: unknown[] }[]
}

/**
 * Overall job status. Failed wins so a problem is never hidden, then running, then completed (all done), then halted, else idle.
 * Takes the import status followed by every export target's status.
 * */
export const deriveJobStatus = (statuses: JobProcessStatus[]): JobProcessStatus => {
    if (statuses.includes('failed')) {
        return 'failed';
    }
    if (statuses.includes('running')) {
        return 'running';
    }
    if (statuses.length > 0 && statuses.every(x => x === 'completed')) {
        return 'completed';
    }
    if (statuses.includes('paused')) {
        return 'paused';
    }
    if (statuses.includes('stopped')) {
        return 'stopped';
    }
    return 'idle';
}

export const jobTransformsSchema = z.union([
    z.object({preset: z.string().min(1)}).meta({description: 'Use a preset from transformersPresets in the config'}),
    z.object({componentId: z.int().positive(), hook: z.enum(['preCompare', 'postCompare'])}).meta({description: "Copy a Source or Client's playTransform stages for this hook"}),
]).meta({description: 'Transform stages applied to plays when they are exported. A snapshot is taken when the job is created'});

export const jobCreateSchema = z.object({
    name: z.string().trim().min(1).max(100),
    importFrom: z.union([
        z.object({componentId: z.int().positive()}).meta({description: 'Import from a Last.fm Source or Client through its API'}),
        z.object({upload: z.literal(true)}).meta({description: 'Import from the export file uploaded in the `file` multipart field'}),
        z.object({existingFile: z.string().min(1)}).meta({description: "Import from a file already in the data directory's imports folder (file name only)"}),
        z.object({mirrorId: z.int().positive()}).meta({description: 'Import nothing, only export scrobbles already in this mirror'}),
    ]),
    mirror: z.union([
        z.object({id: z.int().positive()}),
        z.object({new: z.object({name: z.string().trim().min(1).max(200)})}),
    ]).optional().meta({description: 'Mirror to import into: an existing mirror or a new one. Any import can go into any mirror except locked ones. Required for files. Omitted for a Last.fm component, a new mirror is created. Ignored for importFrom.mirrorId'}),
    overlap: z.enum(JOB_IMPORT_OVERLAPS).default('skip').meta({description: "Where the mirror already has data in the job's range: skip imports only what it doesn't cover yet, replace deletes the mirror's scrobbles in the job's exact range first and imports all of it. Ignored for importFrom.mirrorId"}),
    range: z.union([
        z.literal('all'),
        z.object({from: z.iso.datetime({offset: true}).optional(), to: z.iso.datetime({offset: true}).optional()}),
    ]).default('all'),
    persistInputs: z.boolean().optional().meta({description: 'Save raw upstream data for each imported scrobble. Defaults to true for Last.fm components, false for files'}),
    transforms: jobTransformsSchema.optional(),
    targets: z.array(z.int().positive()).default([]).meta({description: 'Component ids of the Clients to export the mirrored scrobbles to'}),
    exportOrder: z.enum(JOB_EXPORT_ORDERS).default('desc').meta({description: 'desc exports newest first and can start while the import runs. asc exports oldest first, after the oldest scrobbles are imported'}),
    exportQueueLimit: z.int().min(1).max(EXPORT_QUEUE_LIMIT_MAX).default(EXPORT_QUEUE_LIMIT_DEFAULT).meta({description: "The export only sends more scrobbles while a Client's queue (live scrobbles included) holds fewer than this"}),
    upstreamCheck: z.boolean().default(true).meta({description: "Clients fetch scrobbles from their service to skip ones it already has. false only skips scrobbles the Client already has in the database, which is much faster for large exports but can duplicate scrobbles that reached the service some other way"}),
    exportDiscarded: z.boolean().default(false).meta({description: "true => scrobbles that the job's transforms discard are added to each Client in the discarded state, without scrobbling them. false => they are not sent to the Clients"}),
    exportSkipBadTimestamps: z.boolean().default(false).meta({description: 'true => mirror scrobbles with a bad timestamp (see the mirror data issues) are not sent to the Clients'}),
    exportCollapseBursts: z.boolean().default(false).meta({description: 'true => only the first scrobble of each burst (see the mirror data issues), in export order, is sent to the Clients. Exports wait for the import to finish'}),
    exportKeepEpochBursts: z.boolean().default(false).meta({description: 'Only with exportCollapseBursts. true => bursts before 2 Jan 1970 (IE play counts copied from older software) are sent whole and every scrobble before 2 Jan 1970 is sent without a dupe check. Each Client is first checked for scrobbles before 2 Jan 1970, if it has some the export waits for a decision (send or skip) for that Client'}),
    start: z.boolean().default(false).meta({description: 'Start the import and all exports once created'}),
}).meta({title: 'Create Job'});
export type JobCreate = z.input<typeof jobCreateSchema>;

export const cleanupActionSchema = z.enum(CLEANUP_ACTIONS).meta({description: 'compact removes raw data and keeps the scrobbles, delete removes the scrobbles'});

export const cleanupBodySchema = z.object({
    action: cleanupActionSchema,
}).meta({title: 'Cleanup'});

export const mirrorCleanupBodySchema = z.object({
    action: cleanupActionSchema,
    range: z.object({from: z.iso.datetime({offset: true}), to: z.iso.datetime({offset: true})}).optional().meta({description: 'Only scrobbles played in this range. Omit for the whole mirror'}),
}).meta({title: 'Mirror Cleanup'});

export const mirrorUpdateSchema = z.object({
    name: z.string().trim().min(1).max(200),
}).meta({title: 'Update Mirror'});

const keepOrCleanup = z.enum(['keep', ...CLEANUP_ACTIONS]).default('keep');
export const jobDeleteQuerySchema = z.object({
    historical: keepOrCleanup.meta({description: "What to do with the job's mirror data in its range"}),
    scrobbles: keepOrCleanup.meta({description: 'What to do with the scrobbles the job created in its Clients'}),
});

export const jobUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    exportQueueLimit: z.int().min(1).max(EXPORT_QUEUE_LIMIT_MAX).optional(),
    upstreamCheck: z.boolean().optional().meta({description: 'See upstreamCheck on Create Job. Applies to scrobbles exported after the change, ones already queued in a Client keep the old setting'}),
    exportDiscarded: z.boolean().optional().meta({description: 'See exportDiscarded on Create Job. Applies to scrobbles exported after the change'}),
    exportSkipBadTimestamps: z.boolean().optional().meta({description: 'See exportSkipBadTimestamps on Create Job. Applies to scrobbles exported after the change'}),
    exportCollapseBursts: z.boolean().optional().meta({description: 'See exportCollapseBursts on Create Job. Applies to scrobbles exported after the change'}),
    exportKeepEpochBursts: z.boolean().optional().meta({description: 'See exportKeepEpochBursts on Create Job. Applies to scrobbles exported after the change'}),
}).meta({title: 'Update Job'});

export const jobTargetUpdateSchema = z.object({
    epochDecision: z.enum(['send', 'skip']).meta({description: "With exportKeepEpochBursts, when the Client already has scrobbles before 2 Jan 1970: send the job's scrobbles from before then without a dupe check (they may be duplicated), or skip them. Only while the export has not decided yet"}),
}).meta({title: 'Update Job Export'});
