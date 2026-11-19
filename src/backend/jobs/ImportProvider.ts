import type { PlayObject } from "../../core/PlaySchema.ts";
import type { JobImportCursor } from "../common/infrastructure/Job.ts";
import type { TimeRange } from "../utils/RangeUtils.ts";

export interface ImportRecord {
    /** may contain `original` (raw upstream data), which is stored in historical_play_inputs */
    play: PlayObject
    /**
     * Dedupe key built from raw upstream fields, unique within an upstream account.
     * Stored as plays_historical.uid prefixed with the mirror id.
     * */
    key: string
}

export interface ImportBatch {
    records: ImportRecord[]
    /** time span (ms, inclusive) this batch proves is completely imported */
    covered?: TimeRange
    cursor: JobImportCursor
    /** no more records for the gap (gap-driven) or file */
    done: boolean
    /** 0..1, for providers that can't know a record total (files) */
    progress?: number
}

export interface ImportFetchArgs {
    /** coverage gap being filled. undefined for providers that are not gap-driven */
    gap?: TimeRange
    cursor?: JobImportCursor
    signal: AbortSignal
}

export interface ImportProvider {
    readonly kind: string
    /**
     * true => fetches by time range (API). The import loop computes gaps from mirror coverage and asks for each.
     * false => streams everything it has (files) and reports coverage on its final batch.
     * */
    readonly gapDriven: boolean
    /** throws if upstream is not usable yet (IE component not authenticated) */
    ready(): Promise<void>
    fetch(args: ImportFetchArgs): Promise<ImportBatch>
    /** release resources (open files) when the import stops for any reason */
    close?(): void
}

/**
 * Decides when the import loop may fetch the next batch.
 *
 * Full mode fetches as fast as rate limits allow. A future streaming mode would wait until exports need more mirror data.
 * */
export interface ImportPacer {
    waitUntilShouldFetch(signal: AbortSignal): Promise<void>
}

export const fullImportPacer: ImportPacer = {
    waitUntilShouldFetch: async () => undefined
}

export const isApiCursor = (cursor: JobImportCursor | null | undefined): cursor is Extract<JobImportCursor, {to: number}> => cursor !== null && cursor !== undefined && 'to' in cursor;
