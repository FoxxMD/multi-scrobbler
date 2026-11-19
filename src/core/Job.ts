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
    runtime: { import: JobProcessRuntimeJson }
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
 * Takes a list so export targets can be added later.
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
    ]),
    mirror: z.union([
        z.object({id: z.int().positive()}),
        z.object({new: z.object({name: z.string().trim().min(1).max(200), account: z.string().trim().min(1).max(200).optional()})}),
    ]).optional().meta({description: 'Mirror to import a file into. Ignored for Last.fm components (their account decides the mirror) and benjaminbenben files (always a new mirror)'}),
    range: z.union([
        z.literal('all'),
        z.object({from: z.iso.datetime({offset: true}).optional(), to: z.iso.datetime({offset: true}).optional()}),
    ]).default('all'),
    persistInputs: z.boolean().optional().meta({description: 'Save raw upstream data for each imported scrobble. Defaults to true for Last.fm components, false for files'}),
    transforms: jobTransformsSchema.optional(),
    start: z.boolean().default(false),
}).meta({title: 'Create Job'});
export type JobCreate = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
}).meta({title: 'Update Job'});
