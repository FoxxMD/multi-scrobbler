import { childLogger, type Logger } from "@foxxmd/logging";
import { delay, isAbortError } from "abort-controller-x";
import dayjs from "dayjs";
import pRetry from "p-retry";
import pMap from "p-map";
import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import { COMPONENT_STATE, type ComponentState } from "../../core/Api.ts";
import type { QueueContext } from "../../core/Atomic.ts";
import type { JobProcessStatus } from "../../core/Job.ts";
import { policyWindow, type RateLimitStatusJson } from "../../core/RateLimit.ts";
import { todayAwareFormat } from "../../core/TimeUtils.ts";
import type { PlayObject } from "../../core/PlaySchema.ts";
import type { StageConfig } from "../../core/Transform.ts";
import type { WebhookPayload } from "../common/infrastructure/config/health/webhooks.ts";
import { type DbConcrete, runTransaction } from "../common/database/drizzle/drizzleUtils.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import { MirrorRepository } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import { DrizzlePlayHistoricalRepository, type RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import { exportStageSeconds, exportWaitSeconds, timed } from "../common/playMetrics.ts";
import { addStats, JobTargetRepository, type JobTargetNew, type JobTargetSelect } from "../common/database/drizzle/repositories/JobTargetRepository.ts";
import type { JobImportCursor, JobImportCursorApi, JobImportCursorFile, JobTargetBreaker, JobTargetCursor } from "../common/infrastructure/Job.ts";
import type { WildcardEmitter } from "../common/WildcardEmitter.ts";
import type { WriteBudget } from "../common/vendor/atproto/WriteBudget.ts";
import { contiguousCoveredFrom, type TimeRange } from "../utils/RangeUtils.ts";
import { DEFAULT_JOB_TIMINGS, type JobTimings } from "./constants.ts";
import { fullImportPacer, type ImportBatch, type ImportPacer, type ImportProvider, isApiCursor } from "./ImportProvider.ts";
import type { LockRegistry } from "./LockRegistry.ts";

export type HaltStatus = Extract<JobProcessStatus, 'paused' | 'stopped'>;

/** The parts of a Client an export uses */
export interface ExportClient {
    componentId: number
    name: string
    /** shared by all clients, events carry the emitting client's componentId */
    emitter: EventEmitter
    /** plays waiting in the client's queue (not retries) */
    queuedLength: number
    getRunningState(): ComponentState
    queuePlay(data: PlayObject[], context?: QueueContext, opts?: {jobId?: number}): Promise<unknown[]>
    transformPlay(play: PlayObject, hookType: 'postCompare', opts: {stages?: StageConfig[]}): Promise<PlayObject>
    /** the service's write rate limit, for Clients that track one */
    writeBudget?(): Promise<WriteBudget | undefined>
}

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
    /** the running Client for a target, undefined if it is not configured */
    resolveClient?: (componentId: number) => ExportClient | undefined
    /** parse a job's raw transform stages. Throws if any is invalid */
    parseStages?: (raw: unknown[]) => Promise<StageConfig[]>
    /**
     * Names of other jobs on the same mirror whose exports are running and overlap `range`.
     * A replace import can't start while there are any: they would export the replaced plays again.
     * */
    replaceConflicts?: (job: JobSelect, range: TimeRange) => Promise<string[]>
    /** Delete the mirror's plays in range (MirrorService.startCleanup). The caller holds the mirror lock as `holder` */
    deleteMirrorRange?: (mirrorId: number, range: TimeRange, holder: string, signal: AbortSignal) => Promise<{error?: string}>
}

/** Not persisted. Explains what a running process is doing right now */
export interface JobProcessRuntime {
    waiting?: string
    retryAttempt?: number
    nextRetryAt?: string
    /** 0..1 for imports that can't know a record total (files) */
    progress?: number
    /** the export Client's rate limit, when it reports one */
    rateLimit?: RateLimitStatusJson
}

/** A cleanup of the job's scrobbles in its Clients. Not persisted */
export interface JobCleanupRuntime {
    action: 'compact' | 'delete'
    /** the Client being cleaned up right now */
    componentId?: number
    done: number
    total: number
}

export interface JobRuntime {
    import: JobProcessRuntime
    /** by target id */
    exports: Record<number, JobProcessRuntime>
    cleanup?: JobCleanupRuntime
    /** the job is being deleted (with cleanups) */
    deleting?: boolean
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
/** held while plays of a component are cleaned up */
export const componentLockKey = (componentId: number) => `component:${componentId}`;
/** held while a mirror's plays are cleaned up */
export const mirrorLockKey = (mirrorId: number) => `mirror:${mirrorId}`;

/** Failed scrobbles in a row that stop an export. At least the queue limit, so one bad batch doesn't trip it on its own */
export const breakerThreshold = (exportQueueLimit: number) => Math.max(exportQueueLimit, 10);

/** Fields of a target sent in jobUpdate events */
export type TargetUpdate = Partial<Omit<JobTargetSelect, 'id' | 'jobId' | 'componentId' | 'createdAt'>>;

export class JobRunner {

    readonly jobId: number;
    protected deps: JobRunnerDeps;
    protected timings: JobTimings;
    protected logger: Logger;
    protected jobRepo: JobRepository;
    protected mirrorRepo: MirrorRepository;
    protected historicalRepo: DrizzlePlayHistoricalRepository;
    protected targetRepo: JobTargetRepository;
    protected importTask?: ProcessTask;
    /** by target id */
    protected exportTasks = new Map<number, ProcessTask>();
    /** resolves every sleeping export loop, so it re-checks now */
    protected wakers = new Set<() => void>();
    /** a wake that came while a loop was busy, so its next sleep returns at once */
    protected pendingWake = false;
    runtime: JobRuntime = {import: {}, exports: {}};
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
        this.targetRepo = new JobTargetRepository(deps.db, {logger: this.logger});
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
            if(this.deps.locks.holder(mirrorLockKey(job.mirrorId)) !== undefined) {
                throw new JobConflictError('A cleanup is running for this mirror. Start again when it finishes');
            }
            const key = mirrorImportLockKey(job.mirrorId);
            if(!this.deps.locks.tryAcquire(key, holder)) {
                throw new JobConflictError('Another import is already running for this mirror');
            }
            lockKey = key;
            if(job.importOverlap === 'replace' && job.importReplacedAt === null) {
                await this.assertNoReplaceConflicts(job);
            }
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
            this.wake();
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

    /** Abort without changing persisted status so running processes resume on next boot */
    async shutdown(): Promise<void> {
        const tasks = [this.importTask, ...this.exportTasks.values()].filter(x => x !== undefined);
        for(const task of tasks) {
            // a user halt already in progress wins so paused/stopped is still persisted
            task.halt ??= 'shutdown';
            task.abort.abort(new Error('Shutting down'));
        }
        await Promise.allSettled(tasks.map(x => x.promise));
        clearTimeout(this.emitTimer);
    }

    protected async runImport(job: JobSelect, provider: ImportProvider, signal: AbortSignal): Promise<void> {
        const pacer = this.deps.pacer ?? fullImportPacer;

        await this.withRetry(() => this.waitReady(provider, signal), signal);

        const range: TimeRange = [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()];
        if(job.importOverlap === 'replace' && job.importReplacedAt === null) {
            // after ready, so a source that never becomes usable doesn't delete anything
            await this.replaceRange(job, range, signal);
        }

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
                state = await this.commitBatch(job, provider, batch, cursor, state, skipCovered);
                cursor = batch.cursor;
                if(batch.done) {
                    return;
                }
                if(this.timings.importPageDelay > 0) {
                    await delay(signal, this.timings.importPageDelay);
                }
            }
        }

        // files are not gap-driven, skip their records in time the mirror already covers. API imports only fetch gaps
        let skipCovered: TimeRange[] | undefined;
        if(!provider.gapDriven && job.importOverlap === 'skip') {
            skipCovered = (await this.mirrorRepo.getById(job.mirrorId))?.coverage ?? [];
        }

        if(provider.gapDriven) {
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

    protected async commitBatch(job: JobSelect, provider: ImportProvider, batch: ImportBatch, prevCursor: JobImportCursor, state: {importFetched: number, imported: number, importTotal: number | null, cursor: JobImportCursor | null}, skipCovered?: TimeRange[]) {
        const records = skipCovered === undefined || skipCovered.length === 0 ? batch.records : batch.records.filter(r => {
            const ts = r.play.data.playDate?.valueOf();
            return ts === undefined || !skipCovered.some(([from, to]) => ts >= from && ts <= to);
        });
        const rows: (RepositoryCreatePlayHistoricalOpts & {uid: string})[] = records.map(r => ({
            uid: `m${job.mirrorId}:${r.key}`,
            mirrorId: job.mirrorId,
            origin: provider.origin,
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
                await this.mirrorRepo.addCoverage(job.mirrorId, batch.covered, {origin: provider.origin, jobId: job.id});
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
        if(batch.covered !== undefined) {
            this.wake();
        }
        return next;
    }

    protected async assertNoReplaceConflicts(job: JobSelect) {
        const range: TimeRange = [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()];
        const conflicts = await this.deps.replaceConflicts?.(job, range) ?? [];
        if(conflicts.length > 0) {
            throw new JobConflictError(`This import replaces mirror data that ${conflicts.map(x => `'${x}'`).join(', ')} ${conflicts.length === 1 ? 'is' : 'are'} exporting. Stop ${conflicts.length === 1 ? 'its' : 'their'} exports first`);
        }
    }

    /** Delete the mirror's plays in the job's range once, before importing. Exports of this job wait until it is done */
    protected async replaceRange(job: JobSelect, range: TimeRange, signal: AbortSignal) {
        if(this.deps.deleteMirrorRange === undefined) {
            throw new Error('Replacing mirror data is not supported here');
        }
        const holder = `job-replace:${this.jobId}:${randomUUID()}`;
        const key = mirrorLockKey(job.mirrorId);
        if(!this.deps.locks.tryAcquire(key, holder)) {
            throw new JobConflictError('A cleanup is running for this mirror');
        }
        try {
            // again under the lock: an export may have started while waiting for the source to be ready
            await this.assertNoReplaceConflicts(job);
            signal.throwIfAborted();
            this.runtime.import = {...this.runtime.import, waiting: 'Deleting the mirror plays in this range before importing'};
            this.emitUpdate({runtime: this.runtime}, true);
            const {error} = await this.deps.deleteMirrorRange(job.mirrorId, range, holder, signal);
            // stopped or shutting down: halt, importReplacedAt stays unset so a resume deletes the rest
            signal.throwIfAborted();
            if(error !== undefined) {
                throw new Error(`Could not delete the mirror plays to replace: ${error}`);
            }
            const importReplacedAt = dayjs();
            await this.setImport({importReplacedAt});
            job.importReplacedAt = importReplacedAt;
            this.runtime.import = {...this.runtime.import, waiting: undefined};
            this.logger.info(`Deleted mirror plays between ${dayjs(range[0]).toISOString()} and ${dayjs(range[1]).toISOString()} to replace them`);
        } finally {
            this.deps.locks.release(key, holder);
        }
        this.wake();
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

    /** Show (or clear) cleanup progress on the job */
    setCleanup(cleanup: JobCleanupRuntime | undefined) {
        const changed = (this.runtime.cleanup === undefined) !== (cleanup === undefined);
        this.runtime.cleanup = cleanup;
        this.emitUpdate({runtime: this.runtime}, changed);
    }

    setDeleting(deleting: boolean, error?: string) {
        this.runtime.deleting = deleting || undefined;
        this.emitUpdate({runtime: this.runtime, ...(error !== undefined ? {deleteError: error} : {})}, true);
    }

    get exportsRunning(): number[] {
        return Array.from(this.exportTasks.keys());
    }

    /**
     * Start exporting to a target. Throws if the job's transforms can't be used.
     * No-op if already running/starting or completed.
     * */
    async startExport(targetId: number): Promise<void> {
        if(this.exportTasks.has(targetId)) {
            return;
        }
        const task: ProcessTask = {abort: new AbortController(), promise: Promise.resolve()};
        this.exportTasks.set(targetId, task);
        let reportStart!: (err?: unknown) => void;
        const started = new Promise<unknown>(resolve => { reportStart = resolve; });
        task.promise = this.runExportTask(targetId, task, reportStart);
        const startErr = await started;
        if(startErr !== undefined) {
            throw startErr;
        }
    }

    /** Halts the export and keeps its cursor. Plays already queued in the client still get scrobbled. Start resumes */
    async stopExport(targetId: number, status: HaltStatus): Promise<void> {
        const task = this.exportTasks.get(targetId);
        if(task === undefined) {
            const target = await this.targetRepo.getById(targetId);
            if(target?.status === 'running') {
                await this.setTarget(targetId, {status});
            }
            return;
        }
        task.halt = status;
        task.abort.abort(new Error(`Export ${status} by user`));
        await task.promise;
    }

    protected async runExportTask(targetId: number, task: ProcessTask, reportStart: (err?: unknown) => void): Promise<void> {
        const {signal} = task.abort;
        const logger = childLogger(this.logger, `Export ${targetId}`);
        let isStarted = false;
        let completed: JobTargetSelect | undefined;
        let job: JobSelect | undefined;
        let clientName: string | undefined;
        const cleanup: (() => void)[] = [];
        try {
            job = await this.getJob();
            const target = await this.targetRepo.getById(targetId);
            if(target === undefined || target.jobId !== this.jobId) {
                throw new Error(`Target ${targetId} does not belong to Job ${this.jobId}`);
            }
            if(target.status === 'completed') {
                return;
            }
            clientName = this.deps.resolveClient?.(target.componentId)?.name;
            const stages = job.transformOptions !== null && job.transformOptions.length > 0
                ? await (this.deps.parseStages ?? (() => { throw new Error('No stage parser to use job transforms with'); }))(job.transformOptions)
                : undefined;
            signal.throwIfAborted();
            // starting again (IE after fixing the client) gives the breaker a fresh count
            await this.setTarget(targetId, {status: 'running', startedAt: target.startedAt ?? dayjs(), error: null, breaker: {failedInARow: 0}}, true);
            isStarted = true;
            reportStart();
            logger.info('Export started');
            completed = await this.runExport(target, stages, signal, logger, cleanup);
        } catch (e) {
            if(signal.aborted) {
                if(task.halt !== undefined && task.halt !== 'shutdown') {
                    await this.safely(() => this.setTarget(targetId, {status: task.halt as HaltStatus}, true), 'persist halted export status');
                }
                logger.info(`Export halted (${task.halt ?? 'aborted'})`);
            } else if(!isStarted) {
                reportStart(e);
            } else {
                logger.error(new Error('Export failed', {cause: e}));
                await this.safely(() => this.setTarget(targetId, {status: 'failed', error: e as Error}, true), 'persist failed export status');
                await this.safely(() => this.deps.notify?.({title: `Job ${job?.name ?? this.jobId} - Export to ${clientName ?? targetId} Failed`, message: (e as Error).message, priority: 'error'}), 'send notification');
            }
        } finally {
            for(const fn of cleanup) {
                fn();
            }
            reportStart();
            this.exportTasks.delete(targetId);
            delete this.runtime.exports[targetId];
            this.emitUpdate({runtime: this.runtime}, true);
        }

        if(completed !== undefined) {
            const s = completed.stats ?? {};
            const summary = `${completed.exported} exported: ${s.scrobbled ?? 0} scrobbled, ${s.duped ?? 0} already scrobbled, ${s.failed ?? 0} failed`;
            logger.info(`Export complete. ${summary}`);
            await this.safely(() => this.deps.notify?.({title: `Job ${job?.name ?? this.jobId} - Export to ${clientName ?? targetId} Complete`, message: summary, priority: 'info'}), 'send notification');
        }
    }

    /** Returns the completed target */
    protected async runExport(initial: JobTargetSelect, stages: StageConfig[] | undefined, signal: AbortSignal, logger: Logger, cleanup: (() => void)[]): Promise<JobTargetSelect> {
        const targetId = initial.id;
        const {componentId} = initial;
        let {cursor, exported, queued} = initial;
        const breaker: JobTargetBreaker = {failedInARow: 0};
        let lastFailure: string | undefined;
        let listening: EventEmitter | undefined;

        const onClientEvent = (eventName: string) => (payload: {componentId?: number, data?: {jobId?: number | null, state?: string, error?: unknown, queueStates?: {error?: unknown}[]}}) => {
            if(payload?.componentId !== componentId) {
                return;
            }
            if(eventName === 'playUpdate') {
                if(payload.data?.jobId !== this.jobId) {
                    return;
                }
                if(payload.data.state === 'failed') {
                    breaker.failedInARow++;
                    // the play's error, else its failed queue state's
                    const err = payload.data.error ?? payload.data.queueStates?.find(x => x.error !== undefined && x.error !== null)?.error;
                    lastFailure = (err as {message?: string} | null | undefined)?.message ?? lastFailure;
                } else if(payload.data.state === 'scrobbled' || payload.data.state === 'duped') {
                    breaker.failedInARow = 0;
                }
            }
            this.wake();
        }
        const listen = (emitter: EventEmitter) => {
            listening = emitter;
            for(const name of ['playDequeued', 'queueEmptied', 'playUpdate']) {
                const fn = onClientEvent(name);
                emitter.on(name, fn);
                cleanup.push(() => emitter.off(name, fn));
            }
        }
        let rateLimit: RateLimitStatusJson | undefined;
        // pages are small once the client queue is full (one per dequeued play), so play counts refresh on a timer instead of each page
        let statsAt = 0;
        const jobLabel = String(this.jobId);
        let clientLabel = String(componentId);
        /** @param key fixed reason for metrics, `reason` can hold numbers and dates */
        const wait = async (reason: string, key: string = reason) => {
            const waitStart = performance.now();
            const current = this.runtime.exports[targetId];
            if(current?.waiting !== reason || current?.rateLimit?.remaining !== rateLimit?.remaining || current?.rateLimit?.limit !== rateLimit?.limit) {
                this.runtime.exports[targetId] = {waiting: reason, rateLimit};
                this.emitUpdate({runtime: this.runtime});
            }
            try {
                await this.sleep(signal, this.timings.exportPoll);
            } finally {
                exportWaitSeconds.inc({job: jobLabel, client: clientLabel, reason: key}, (performance.now() - waitStart) / 1000);
            }
        }
        const stage = <T>(name: string, fn: () => Promise<T>) => timed(exportStageSeconds, {job: jobLabel, client: clientLabel, stage: name}, fn);

        while(true) {
            signal.throwIfAborted();
            const passStart = performance.now();
            // reloaded each pass: import progress and the queue limit can change while exporting
            const job = await this.getJob();

            const client = this.deps.resolveClient?.(componentId);
            if(client === undefined) {
                await wait('Client is not configured');
                continue;
            }
            clientLabel = client.name;
            if(listening !== client.emitter) {
                listen(client.emitter);
            }
            if(breaker.failedInARow >= breakerThreshold(job.exportQueueLimit)) {
                await this.targetRepo.update(targetId, {breaker: {...breaker, trippedAt: Date.now()}});
                throw new Error(`Stopped after ${breaker.failedInARow} failed scrobbles in a row${lastFailure !== undefined ? `. Last error: ${lastFailure}` : ''}`);
            }
            // before the running check: a Client paused by its own rate limit reserve is not running
            const budget = await client.writeBudget?.();
            rateLimit = budget === undefined ? undefined : {limit: budget.limit, remaining: budget.remaining, reserve: budget.exportReserve, reset: budget.reset, policy: budget.policy};
            if(budget !== undefined && budget.remaining <= budget.exportReserve) {
                const window = policyWindow(budget.policy);
                await wait(`Rate limit reserve for exports reached, ${budget.remaining.toLocaleString()} of ${budget.limit.toLocaleString()} points left${window !== undefined ? ` per ${window}` : ''}. Waiting until ${todayAwareFormat(dayjs(budget.reset))}`, 'Rate limit reserve for exports reached');
                continue;
            }
            if(client.getRunningState() !== COMPONENT_STATE.RUNNING) {
                await wait('Client is not running');
                continue;
            }
            if(this.cleanupLocked(componentId, job.mirrorId)) {
                await wait('Waiting for a cleanup to finish');
                continue;
            }
            const room = job.exportQueueLimit - client.queuedLength;
            if(room <= 0) {
                await wait('Client queue is full');
                continue;
            }

            const range: TimeRange = [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()];
            const importDone = job.importStatus === 'completed' || (job.componentFromId === null && job.importFile === null);
            if(!importDone && job.importOverlap === 'replace' && job.importReplacedAt === null) {
                // the mirror still has the plays the import replaces
                await wait('Waiting for the import to replace the mirror data in this range');
                continue;
            }
            let frontier: TimeRange | undefined = range;
            if(!importDone) {
                // only export what is already mirrored without a gap from the starting edge, so nothing is skipped
                const mirror = await this.mirrorRepo.getById(job.mirrorId);
                const covered = contiguousCoveredFrom(job.exportOrder === 'desc' ? range[1] : range[0], job.exportOrder, mirror?.coverage ?? []);
                frontier = covered === undefined ? undefined : [Math.max(covered[0], range[0]), Math.min(covered[1], range[1])];
            }
            const rows = frontier === undefined ? [] : await stage('page_read', () => this.historicalRepo.findPageForExport({mirrorId: job.mirrorId, range: frontier, order: job.exportOrder, after: cursor ?? undefined, limit: room}));

            if(rows.length === 0) {
                if(!importDone) {
                    const halted = job.importStatus === 'idle' || job.importStatus === 'running' ? undefined : job.importStatus;
                    await wait(halted === undefined ? 'Waiting for the import to mirror more scrobbles' : `Waiting for the import, which is ${halted}`, 'Waiting for the import');
                    continue;
                }
                const stats = addStats((await this.targetRepo.playStats(this.jobId, componentId)).get(componentId), initial.removedStats);
                const left = stats.queued ?? 0;
                if(left > 0) {
                    await this.setTarget(targetId, {stats, breaker});
                    await wait(`${left} exported scrobbles are still queued in the client`, 'Exported scrobbles are still queued in the client');
                    continue;
                }
                return (await this.setTarget(targetId, {status: 'completed', completedAt: dayjs(), stats, breaker}, true))!;
            }

            let plays: PlayObject[] = rows.map(r => ({...r.play, original: {play: r.play}}));
            if(stages !== undefined) {
                plays = await stage('job_transform', () => pMap(plays, async (p) => {
                    const {lifecycle: _, ...transformed} = await client.transformPlay(p, 'postCompare', {stages});
                    return transformed;
                }, {concurrency: 5}));
            }
            signal.throwIfAborted();
            if(this.cleanupLocked(componentId, job.mirrorId)) {
                // a cleanup started while this page was read, the next pass waits for it and reads the page again
                continue;
            }
            const created = await stage('queue_play', () => client.queuePlay(plays, job.exportUpstreamCheck ? undefined : {upstreamCheck: false}, {jobId: this.jobId}));
            const last = rows[rows.length - 1];
            cursor = {playedAt: last.playedAt, id: last.id} satisfies JobTargetCursor;
            exported += rows.length;
            queued += created.length;
            const update: Partial<JobTargetNew> = {cursor, exported, queued, breaker};
            if(Date.now() - statsAt >= this.timings.exportStats) {
                update.stats = addStats((await stage('stats', () => this.targetRepo.playStats(this.jobId, componentId))).get(componentId), initial.removedStats);
                statsAt = Date.now();
            }
            this.runtime.exports[targetId] = {rateLimit};
            await this.setTarget(targetId, update);
            // only passes that exported a page, waits are in exportWaitSeconds
            exportStageSeconds.observe({job: jobLabel, client: clientLabel, stage: 'pass'}, (performance.now() - passStart) / 1000);
            logger.verbose(`Exported ${rows.length} scrobbles, ${created.length} new to the client`);
        }
    }

    protected cleanupLocked(componentId: number, mirrorId: number): boolean {
        return this.deps.locks.holder(componentLockKey(componentId)) !== undefined || this.deps.locks.holder(mirrorLockKey(mirrorId)) !== undefined;
    }

    /** Wake every export loop so it re-checks now (new coverage, import finished, settings changed) */
    wake() {
        // also kept for loops that are busy (IE querying) right now, at worst a sleeping loop makes one extra pass
        this.pendingWake = true;
        for(const fn of Array.from(this.wakers)) {
            fn();
        }
    }

    /** Sleep until woken, `ms` passes, or aborted */
    protected async sleep(signal: AbortSignal, ms: number): Promise<void> {
        // an abort listener added after the abort never fires
        signal.throwIfAborted();
        if(this.pendingWake) {
            this.pendingWake = false;
            return;
        }
        await new Promise<void>((resolve) => {
            const done = () => {
                clearTimeout(timer);
                this.wakers.delete(done);
                signal.removeEventListener('abort', done);
                resolve();
            };
            const timer = setTimeout(done, ms);
            this.wakers.add(done);
            signal.addEventListener('abort', done, {once: true});
        });
        signal.throwIfAborted();
    }

    protected async setTarget(targetId: number, data: Partial<JobTargetNew>, force = false) {
        const updated = await this.targetRepo.update(targetId, data);
        const {jobId: _j, componentId: _c, id: _i, ...fields} = data;
        this.emitUpdate({targetUpdates: {[targetId]: {...fields, updatedAt: updated?.updatedAt}}, runtime: this.runtime}, force);
        return updated;
    }

    /** Throttled per job so a fast import doesn't flood SSE. `force` sends immediately (status changes) */
    protected emitUpdate(data: Record<string, unknown>, force = false) {
        const targetUpdates = this.pendingEmit.targetUpdates as Record<number, TargetUpdate> | undefined;
        this.pendingEmit = {...this.pendingEmit, ...data};
        if(targetUpdates !== undefined && data.targetUpdates !== undefined) {
            // keep pending changes of other targets, and earlier fields of the same target
            const merged = {...targetUpdates};
            for(const [id, update] of Object.entries(data.targetUpdates as Record<number, TargetUpdate>)) {
                merged[Number(id)] = {...merged[Number(id)], ...update};
            }
            this.pendingEmit.targetUpdates = merged;
        }
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
