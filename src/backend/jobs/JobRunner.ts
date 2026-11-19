import { childLogger, type Logger } from "@foxxmd/logging";
import { delay, isAbortError } from "abort-controller-x";
import dayjs from "dayjs";
import pRetry from "p-retry";
import { randomUUID } from "node:crypto";
import type { JobProcessStatus } from "../../core/Job.ts";
import type { WebhookPayload } from "../common/infrastructure/config/health/webhooks.ts";
import { type DbConcrete, runTransaction } from "../common/database/drizzle/drizzleUtils.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import { MirrorRepository } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import { DrizzlePlayHistoricalRepository, type RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import type { JobImportCursor, JobImportCursorApi, JobImportCursorFile } from "../common/infrastructure/Job.ts";
import type { WildcardEmitter } from "../common/WildcardEmitter.ts";
import type { TimeRange } from "../utils/RangeUtils.ts";
import { DEFAULT_JOB_TIMINGS, type JobTimings } from "./constants.ts";
import { fullImportPacer, type ImportBatch, type ImportPacer, type ImportProvider, isApiCursor } from "./ImportProvider.ts";
import type { LockRegistry } from "./LockRegistry.ts";

export type HaltStatus = Extract<JobProcessStatus, 'paused' | 'stopped'>;

export interface JobRunnerDeps {
    db: DbConcrete
    logger: Logger
    locks: LockRegistry
    emitter: WildcardEmitter
    /** undefined => job has nothing to import (mirror-only) */
    createProvider: (job: JobSelect) => ImportProvider | undefined
    notify?: (payload: Omit<WebhookPayload, 'identifier'>) => Promise<void>
    timings?: Partial<JobTimings>
    pacer?: ImportPacer
}

/** Not persisted. Explains what a running process is doing right now */
export interface JobProcessRuntime {
    waiting?: string
    retryAttempt?: number
    nextRetryAt?: string
    /** 0..1 for imports that can't know a record total (files) */
    progress?: number
}

export interface JobRuntime {
    import: JobProcessRuntime
}

export class JobConflictError extends Error {
    name = 'JobConflictError';
}

interface ProcessTask {
    abort: AbortController
    promise: Promise<void>
    /** how to persist status when the abort lands. shutdown => leave 'running' so it resumes on boot */
    halt?: HaltStatus | 'shutdown'
}

export const mirrorImportLockKey = (mirrorId: number) => `mirror-import:${mirrorId}`;

export class JobRunner {

    readonly jobId: number;
    protected deps: JobRunnerDeps;
    protected timings: JobTimings;
    protected logger: Logger;
    protected jobRepo: JobRepository;
    protected mirrorRepo: MirrorRepository;
    protected historicalRepo: DrizzlePlayHistoricalRepository;
    protected importTask?: ProcessTask;
    runtime: JobRuntime = {import: {}};
    /** owner, so events only reach their sessions. Known once the job has been loaded */
    userId?: string | null;

    protected pendingEmit: Record<string, unknown> = {};
    protected lastEmit = 0;
    protected emitTimer?: ReturnType<typeof setTimeout>;

    constructor(jobId: number, deps: JobRunnerDeps) {
        this.jobId = jobId;
        this.deps = deps;
        this.timings = {...DEFAULT_JOB_TIMINGS, ...(deps.timings ?? {})};
        this.logger = childLogger(deps.logger, `Job ${jobId}`);
        this.jobRepo = new JobRepository(deps.db, {logger: this.logger});
        this.mirrorRepo = new MirrorRepository(deps.db, {logger: this.logger});
        this.historicalRepo = new DrizzlePlayHistoricalRepository(deps.db, {logger: this.logger});
    }

    get importRunning() {
        return this.importTask !== undefined;
    }

    protected async getJob(): Promise<JobSelect> {
        const job = await this.jobRepo.getById(this.jobId);
        if(job === undefined) {
            throw new Error(`Job ${this.jobId} does not exist`);
        }
        this.userId = job.userId;
        return job;
    }

    /**
     * Throws JobConflictError if another job is importing into the same mirror, or any error from creating the import provider.
     * No-op if already running/starting or completed.
     * */
    async startImport(): Promise<void> {
        if(this.importTask !== undefined) {
            return;
        }
        // registered before any await so a concurrent start, stop, or shutdown sees it
        const task: ProcessTask = {abort: new AbortController(), promise: Promise.resolve()};
        this.importTask = task;
        let reportStart!: (err?: unknown) => void;
        const started = new Promise<unknown>(resolve => { reportStart = resolve; });
        task.promise = this.runImportTask(task, reportStart);
        const startErr = await started;
        if(startErr !== undefined) {
            throw startErr;
        }
    }

    protected async runImportTask(task: ProcessTask, reportStart: (err?: unknown) => void): Promise<void> {
        const {signal} = task.abort;
        const holder = `job:${this.jobId}:${randomUUID()}`;
        let lockKey: string | undefined;
        let isStarted = false;
        let job: JobSelect | undefined;
        let completed = false;
        let provider: ImportProvider | undefined;
        try {
            job = await this.getJob();
            if(job.importStatus === 'completed') {
                return;
            }
            provider = this.deps.createProvider(job);
            if(provider === undefined) {
                // mirror-only job, nothing to import
                await this.setImport({importStatus: 'completed', importCompletedAt: dayjs()});
                return;
            }
            const key = mirrorImportLockKey(job.mirrorId);
            if(!this.deps.locks.tryAcquire(key, holder)) {
                throw new JobConflictError('Another import is already running for this mirror');
            }
            lockKey = key;
            signal.throwIfAborted();
            await this.setImport({importStatus: 'running', importStartedAt: job.importStartedAt ?? dayjs(), importError: null});
            isStarted = true;
            reportStart();
            this.logger.info('Import started');

            await this.runImport(job, provider, signal);
            await this.setImport({importStatus: 'completed', importCompletedAt: dayjs()});
            completed = true;
        } catch (e) {
            if(signal.aborted) {
                if(task.halt !== undefined && task.halt !== 'shutdown') {
                    await this.safely(() => this.setImport({importStatus: task.halt as HaltStatus}), 'persist halted import status');
                }
                this.logger.info(`Import halted (${task.halt ?? 'aborted'})`);
            } else if(!isStarted) {
                reportStart(e);
            } else {
                this.logger.error(new Error('Import failed', {cause: e}));
                await this.safely(() => this.setImport({importStatus: 'failed', importError: e as Error}), 'persist failed import status');
                await this.safely(() => this.deps.notify?.({title: `Job ${job?.name ?? this.jobId} - Import Failed`, message: (e as Error).message, priority: 'error'}), 'send notification');
            }
        } finally {
            provider?.close?.();
            // no-op if already reported
            reportStart();
            if(lockKey !== undefined) {
                this.deps.locks.release(lockKey, holder);
            }
            this.importTask = undefined;
            this.runtime.import = {};
            this.emitUpdate({runtime: this.runtime}, true);
        }

        if(completed) {
            const done = await this.jobRepo.getById(this.jobId);
            this.logger.info(`Import complete: ${done?.imported} new scrobbles added to mirror`);
            await this.safely(() => this.deps.notify?.({title: `Job ${job?.name ?? this.jobId} - Import Complete`, message: `${done?.imported} new scrobbles added (${done?.importFetched} fetched)`, priority: 'info'}), 'send notification');
        }
    }

    protected async safely(fn: () => Promise<unknown> | undefined, action: string) {
        try {
            await fn();
        } catch (e) {
            this.logger.warn(new Error(`Failed to ${action}`, {cause: e}));
        }
    }

    /** Halts the import and keeps its cursor. Start resumes */
    async stopImport(status: HaltStatus): Promise<void> {
        if(this.importTask === undefined) {
            const job = await this.getJob();
            if(job.importStatus === 'running') {
                // persisted as running but not running in this process (IE never resumed)
                await this.setImport({importStatus: status});
            }
            return;
        }
        this.importTask.halt = status;
        this.importTask.abort.abort(new Error(`Import ${status} by user`));
        await this.importTask.promise;
    }

    /** Abort without changing persisted status so the import resumes on next boot */
    async shutdown(): Promise<void> {
        if(this.importTask !== undefined) {
            // a user halt already in progress wins so paused/stopped is still persisted
            this.importTask.halt ??= 'shutdown';
            this.importTask.abort.abort(new Error('Shutting down'));
            await this.importTask.promise;
        }
        clearTimeout(this.emitTimer);
    }

    protected async runImport(job: JobSelect, provider: ImportProvider, signal: AbortSignal): Promise<void> {
        const pacer = this.deps.pacer ?? fullImportPacer;

        await this.withRetry(() => this.waitReady(provider, signal), signal);

        let state = {
            importFetched: job.importFetched,
            imported: job.imported,
            importTotal: job.importTotal,
            cursor: job.importCursor,
        };

        const runBatches = async (gap: TimeRange | undefined, initial: JobImportCursor) => {
            let cursor = initial;
            while(true) {
                await pacer.waitUntilShouldFetch(signal);
                const batch = await this.withRetry(() => provider.fetch({gap, cursor, signal}), signal);
                signal.throwIfAborted();
                if(!batch.done && JSON.stringify(batch.cursor) === JSON.stringify(cursor)) {
                    // would loop forever (and without a real delay, starve the event loop)
                    throw new Error(`Import source made no progress, cursor did not move from ${JSON.stringify(cursor)}`);
                }
                state = await this.commitBatch(job, batch, cursor, state);
                cursor = batch.cursor;
                if(batch.done) {
                    return;
                }
                if(this.timings.importPageDelay > 0) {
                    await delay(signal, this.timings.importPageDelay);
                }
            }
        }

        if(provider.gapDriven) {
            const range: TimeRange = [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()];
            // newest first, Last.fm and most apis page newest -> oldest
            const gaps = (await this.mirrorRepo.getGaps(job.mirrorId, range)).reverse();
            if(gaps.length === 0) {
                this.logger.info('Mirror already has all data for this range, nothing to import');
            }
            for(const gap of gaps) {
                const prev = state.cursor;
                // coverage moves the top of a partially imported gap down to just above the cursor, so reuse a cursor that falls inside it
                const cursor: JobImportCursorApi = isApiCursor(prev) && prev.to >= gap[0] && prev.to <= gap[1]
                    ? prev
                    : {gapTo: gap[1], to: gap[1]};
                await runBatches(gap, cursor);
            }
        } else {
            const prev = state.cursor;
            const cursor: JobImportCursorFile = prev !== null && prev !== undefined && 'records' in prev ? prev : {records: 0};
            await runBatches(undefined, cursor);
        }
    }

    protected async commitBatch(job: JobSelect, batch: ImportBatch, prevCursor: JobImportCursor, state: {importFetched: number, imported: number, importTotal: number | null, cursor: JobImportCursor | null}) {
        const rows: (RepositoryCreatePlayHistoricalOpts & {uid: string})[] = batch.records.map(r => ({
            uid: `m${job.mirrorId}:${r.key}`,
            mirrorId: job.mirrorId,
            play: r.play,
            input: r.play.original !== undefined ? {play: r.play.original.play as RepositoryCreatePlayHistoricalOpts['play'] | undefined, data: r.play.original.data as object} : undefined,
        }));

        let importTotal = state.importTotal;
        if(isApiCursor(batch.cursor) && batch.cursor.gapTotal !== undefined && (!isApiCursor(prevCursor) || prevCursor.gapTotal === undefined)) {
            importTotal = (importTotal ?? 0) + batch.cursor.gapTotal;
        }

        const next = await runTransaction(this.deps.db, async () => {
            const inserted = await this.historicalRepo.insertIgnoreDuplicates(rows, {persistInputs: job.persistInputs});
            if(batch.covered !== undefined) {
                await this.mirrorRepo.addCoverage(job.mirrorId, batch.covered);
            }
            const updated = {
                importFetched: state.importFetched + batch.records.length,
                imported: state.imported + inserted,
                importTotal,
                cursor: batch.cursor,
            };
            await this.jobRepo.update(job.id, {importFetched: updated.importFetched, imported: updated.imported, importTotal, importCursor: batch.cursor});
            return updated;
        });

        this.runtime.import = {...this.runtime.import, waiting: undefined, retryAttempt: undefined, nextRetryAt: undefined, progress: batch.progress};
        this.emitUpdate({importFetched: next.importFetched, imported: next.imported, importTotal, importCursor: batch.cursor, runtime: this.runtime});
        return next;
    }

    protected async waitReady(provider: ImportProvider, signal: AbortSignal): Promise<void> {
        const start = Date.now();
        while(true) {
            try {
                await provider.ready();
                this.runtime.import.waiting = undefined;
                return;
            } catch (e) {
                if(Date.now() - start >= this.timings.readyTimeout) {
                    throw new Error('Import source did not become ready', {cause: e});
                }
                this.runtime.import.waiting = `Waiting for import source to be ready: ${(e as Error).message}`;
                this.emitUpdate({runtime: this.runtime});
                await delay(signal, this.timings.readyPoll);
            }
        }
    }

    protected async withRetry<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
        return pRetry(fn, {
            retries: this.timings.importRetries,
            minTimeout: this.timings.importRetryBase,
            factor: 2,
            signal,
            shouldRetry: ({error}) => !isAbortError(error) && !signal.aborted,
            onFailedAttempt: ({error, attemptNumber, retriesLeft}) => {
                if(retriesLeft === 0 || isAbortError(error) || signal.aborted) {
                    return;
                }
                const wait = this.timings.importRetryBase * Math.pow(2, attemptNumber - 1);
                this.logger.warn(new Error(`Import attempt ${attemptNumber} failed, retrying in ${Math.round(wait / 1000)}s (${retriesLeft} retries left)`, {cause: error}));
                this.runtime.import = {...this.runtime.import, retryAttempt: attemptNumber, nextRetryAt: dayjs().add(wait, 'ms').toISOString(), waiting: `Retrying after error: ${(error as Error).message}`};
                this.emitUpdate({runtime: this.runtime});
            }
        });
    }

    protected async setImport(data: Parameters<JobRepository['update']>[1]) {
        const updated = await this.jobRepo.update(this.jobId, data);
        this.emitUpdate({...data, runtime: this.runtime}, true);
        return updated;
    }

    /** Throttled per job so a fast import doesn't flood SSE. `force` sends immediately (status changes) */
    protected emitUpdate(data: Record<string, unknown>, force = false) {
        this.pendingEmit = {...this.pendingEmit, ...data};
        const send = () => {
            clearTimeout(this.emitTimer);
            this.emitTimer = undefined;
            this.lastEmit = Date.now();
            const payload = this.pendingEmit;
            this.pendingEmit = {};
            this.deps.emitter.emit('jobUpdate', {jobId: this.jobId, userId: this.userId, data: payload});
        }
        const since = Date.now() - this.lastEmit;
        if(force || since >= this.timings.emitThrottle) {
            send();
        } else if(this.emitTimer === undefined) {
            this.emitTimer = setTimeout(send, this.timings.emitThrottle - since);
        }
    }
}
