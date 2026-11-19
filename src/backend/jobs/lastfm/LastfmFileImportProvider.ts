import { access, constants } from "node:fs/promises";
import type { JobImportCursorFile, JobImportFile } from "../../common/infrastructure/Job.ts";
import type { TimeRange } from "../../utils/RangeUtils.ts";
import type { ImportBatch, ImportFetchArgs, ImportProvider, ImportRecord } from "../ImportProvider.ts";
import { type FileTrackStream, readLastfmFile } from "./lastfmFiles.ts";
import { lastfmTrackToRecord } from "./lastfmRecords.ts";

export const FILE_BATCH_SIZE = 500;

/**
 * Streams a Last.fm export file. Not gap-driven: the whole file is read and, when finished,
 * coverage is added for [oldest, newest] scrobble in the file (within the job range).
 *
 * Assumes the export is a complete dump between its oldest and newest scrobble.
 * */
export class LastfmFileImportProvider implements ImportProvider {
    readonly kind = 'lastfm-file';
    readonly gapDriven = false;

    protected file: JobImportFile;
    protected range: TimeRange;
    protected batchSize: number;
    protected stream?: FileTrackStream;
    protected iterator?: AsyncIterator<unknown>;
    protected processed = 0;
    protected min?: number;
    protected max?: number;
    protected occurrences: Map<string, number> = new Map();

    constructor(file: JobImportFile, range: TimeRange, opts: {batchSize?: number} = {}) {
        this.file = file;
        this.range = range;
        this.batchSize = opts.batchSize ?? FILE_BATCH_SIZE;
    }

    async ready() {
        try {
                await access(this.file.path, constants.R_OK);
        } catch (e) {
            throw new Error(`Import file ${this.file.originalName} is missing or not readable at ${this.file.path}`, {cause: e});
        }
    }

    async fetch(args: ImportFetchArgs): Promise<ImportBatch> {
        const cursor = (args.cursor ?? {records: 0}) as JobImportCursorFile;
        if (this.stream === undefined) {
            this.stream = readLastfmFile(this.file.path, this.file.format);
            this.iterator = this.stream.tracks[Symbol.asyncIterator]();
            this.processed = 0;
            this.min = undefined;
            this.max = undefined;
            this.occurrences = new Map();
        }
        const iterator = this.iterator as AsyncIterator<Parameters<typeof lastfmTrackToRecord>[0]>;
        const records: ImportRecord[] = [];
        let done = false;
        try {
            // records skipped on resume are still parsed so file min/max (coverage) stays correct
            while (records.length < this.batchSize) {
                args.signal.throwIfAborted();
                const next = await iterator.next();
                if (next.done) {
                    done = true;
                    break;
                }
                this.processed++;
                const record = lastfmTrackToRecord(next.value);
                if (record === undefined) {
                    continue;
                }
                if (this.file.format === 'lastfm-benjamin-csv') {
                    // minute precision: keep legitimate repeats of a track within the same minute. File order is fixed so this is stable across resumes
                    const n = this.occurrences.get(record.key) ?? 0;
                    this.occurrences.set(record.key, n + 1);
                    if (n > 0) {
                        record.key = `${record.key}:${n}`;
                    }
                }
                const ts = record.play.data.playDate!.valueOf();
                this.min = this.min === undefined ? ts : Math.min(this.min, ts);
                this.max = this.max === undefined ? ts : Math.max(this.max, ts);
                if (this.processed <= cursor.records || ts < this.range[0] || ts > this.range[1]) {
                    continue;
                }
                records.push(record);
            }
        } catch (e) {
            // a dead iterator would report done on retry and claim coverage for unread records. Retry reopens the file and skips to the cursor
            this.close();
            throw e;
        }
        if (done && this.min === undefined) {
            this.close();
            throw new Error(`No scrobbles were found in ${this.file.originalName}`);
        }
        const progress = this.file.size > 0 ? Math.min(1, this.stream.bytesRead() / this.file.size) : undefined;
        const batch: ImportBatch = {records, cursor: {records: Math.max(this.processed, cursor.records)}, done, progress};
        if (done) {
            this.close();
            if (this.min !== undefined && this.max !== undefined) {
                const from = Math.max(this.min, this.range[0]);
                const to = Math.min(this.max, this.range[1]);
                if (from <= to) {
                    batch.covered = [from, to];
                }
            }
        }
        return batch;
    }

    close() {
        this.stream?.close();
        this.stream = undefined;
        this.iterator = undefined;
    }
}
