import * as z from "zod";
import type { ErrorObject } from "serialize-error";

/**
 * Status of a job process (import, or export to one target).
 *
 * `paused` and `stopped` behave the same (halted, cursor kept, Start resumes) and only differ for display.
 * */
export const JOB_PROCESS_STATUSES = ['idle', 'running', 'paused', 'stopped', 'failed', 'completed'] as const;
export type JobProcessStatus = typeof JOB_PROCESS_STATUSES[number];

export const LASTFM_FILE_FORMATS = ['lastfm-ghan-json', 'lastfm-ghan-csv', 'lastfm-benjamin-csv'] as const;
export type LastfmFileFormat = typeof LASTFM_FILE_FORMATS[number];


/** Runtime state of a process, not persisted */
export interface JobProcessRuntimeJson {
    waiting?: string
    retryAttempt?: number
    nextRetryAt?: string
    progress?: number
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
    mirror: { id: number, name: string, service: string, account: string | null }
    importFrom: JobImportOriginJson
    rangeFrom: string | null
    rangeTo: string
    persistInputs: boolean
    /** transform stages applied to exported plays, null => none */
    transformOptions: unknown[] | null
    transformSource: JobTransformSource | null
    exportOrder: JobExportOrder
    /** the export only sends more plays while a target client's queue (live plays included) holds fewer than this */
    exportQueueLimit: number
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
    /** completely mirrored time ranges, inclusive unix ms */
    coverage: [number, number][]
    /** holes between the first and last covered time */
    gaps: [number, number][]
    plays: number
    jobs: { id: number, name: string }[]
    task: MirrorTaskJson | null
    createdAt: string
    updatedAt: string
}

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
    mirrors: { id: number, name: string, service: string, account: string | null, coverage: [number, number][], playCount: number }[]
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
        z.object({new: z.object({name: z.string().trim().min(1).max(200), account: z.string().trim().min(1).max(200).optional()})}),
    ]).optional().meta({description: 'Mirror to import a file into. Ignored for Last.fm components (their account decides the mirror), benjaminbenben files (always a new mirror) and importFrom.mirrorId'}),
    range: z.union([
        z.literal('all'),
        z.object({from: z.iso.datetime({offset: true}).optional(), to: z.iso.datetime({offset: true}).optional()}),
    ]).default('all'),
    persistInputs: z.boolean().optional().meta({description: 'Save raw upstream data for each imported scrobble. Defaults to true for Last.fm components, false for files'}),
    transforms: jobTransformsSchema.optional(),
    targets: z.array(z.int().positive()).default([]).meta({description: 'Component ids of the Clients to export the mirrored scrobbles to'}),
    exportOrder: z.enum(JOB_EXPORT_ORDERS).default('desc').meta({description: 'desc exports newest first and can start while the import runs. asc exports oldest first, after the oldest scrobbles are imported'}),
    exportQueueLimit: z.int().min(1).max(EXPORT_QUEUE_LIMIT_MAX).default(EXPORT_QUEUE_LIMIT_DEFAULT).meta({description: "The export only sends more scrobbles while a Client's queue (live scrobbles included) holds fewer than this"}),
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
}).meta({title: 'Update Job'});
