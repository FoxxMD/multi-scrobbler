import type { LastfmFileFormat } from "../../../core/Job.ts";

/** Resume position of a time-range (API) import. All times are unix ms */
export interface JobImportCursorApi {
    /** `to` of the coverage gap currently being imported */
    gapTo: number
    /** next request fetches records at or before this time */
    to: number
    /** upstream reported total for this gap, set once */
    gapTotal?: number
    /** only used when paging inside a single second that has more records than one page holds */
    page?: number
}

/** Resume position of a file import */
export interface JobImportCursorFile {
    /** number of records already processed */
    records: number
}

export type JobImportCursor = JobImportCursorApi | JobImportCursorFile;

export interface JobImportFile {
    /** absolute path */
    path: string
    originalName: string
    format: LastfmFileFormat
    /** bytes */
    size: number
    /** true => uploaded through MS and deleted with the job. false => placed by the user, never deleted */
    managed: boolean
}

export type JobTransformSource = { kind: 'preset', name: string }
    | { kind: 'component', componentId: number, componentName: string, hook: 'preCompare' | 'postCompare' };
