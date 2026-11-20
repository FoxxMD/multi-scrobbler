import { childLogger, type Logger } from "@foxxmd/logging";
import dayjs from "dayjs";
import { randomUUID } from "node:crypto";
import type { DbConcrete } from "../common/database/drizzle/drizzleUtils.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import { MirrorRepository, type PlayMirrorSelect } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import { DrizzlePlayHistoricalRepository } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import type { WildcardEmitter } from "../common/WildcardEmitter.ts";
import { subtractRanges, type TimeRange } from "../utils/RangeUtils.ts";
import { JobConflictError, mirrorLockKey } from "./JobRunner.ts";
import type { LockRegistry } from "./LockRegistry.ts";

export type CleanupAction = 'compact' | 'delete';

/** A cleanup or delete running on a mirror. Not persisted */
export interface MirrorTask {
    kind: 'cleanup' | 'delete'
    action?: CleanupAction
    /** inclusive ms. undefined => the whole mirror */
    range?: TimeRange
    done: number
    total: number
    startedAt: string
}

export interface MirrorDetails {
    mirror: PlayMirrorSelect
    plays: number
    /** holes between the first and last covered time */
    gaps: TimeRange[]
    jobs: JobSelect[]
    task?: MirrorTask
}

export interface MirrorServiceDeps {
    /** a getter, so tests that repoint the JobManager's db also repoint this */
    readonly db: DbConcrete
    logger: Logger
    locks: LockRegistry
    emitter: WildcardEmitter
    /** true while the job's import or any of its exports is running */
    isJobActive: (jobId: number) => boolean
    batchSize?: number
}

/** A cleanup started in the background. `done` resolves when it finishes, with the error if it failed or was interrupted. Never rejects */
export interface StartedTask {
    done: Promise<{error?: string}>
}

/**
 * Manages mirrors: details, rename, compacting/deleting their plays, deleting them.
 *
 * Cleanups hold the `mirror:{id}` lock. While held, exports from the mirror wait and imports into it can't start.
 * */
export class MirrorService {

    protected deps: MirrorServiceDeps;
    protected logger: Logger;
    protected tasks = new Map<number, MirrorTask>();
    protected aborts = new Map<number, AbortController>();

    constructor(deps: MirrorServiceDeps) {
        this.deps = deps;
        this.logger = childLogger(deps.logger, 'Mirrors');
    }

    protected get batchSize() {
        return this.deps.batchSize ?? 1000;
    }

    protected get mirrorRepo() {
        return new MirrorRepository(this.deps.db, {logger: this.logger});
    }

    protected get historicalRepo() {
        return new DrizzlePlayHistoricalRepository(this.deps.db, {logger: this.logger});
    }

    protected get jobRepo() {
        return new JobRepository(this.deps.db, {logger: this.logger});
    }

    getTask(id: number): MirrorTask | undefined {
        return this.tasks.get(id);
    }

    list = async (userId: string): Promise<{mirror: PlayMirrorSelect, plays: number, task?: MirrorTask}[]> => {
        const mirrors = await this.mirrorRepo.findForUser(userId);
        const counts = await this.mirrorRepo.playCounts(mirrors.map(x => x.id));
        return mirrors.map(mirror => ({mirror, plays: counts.get(mirror.id) ?? 0, task: this.tasks.get(mirror.id)}));
    }

    get = async (id: number): Promise<MirrorDetails | undefined> => {
        const mirror = await this.mirrorRepo.getById(id);
        if (mirror === undefined) {
            return undefined;
        }
        const {coverage} = mirror;
        const gaps = coverage.length < 2 ? [] : subtractRanges([coverage[0][0], coverage[coverage.length - 1][1]], coverage);
        return {
            mirror,
            plays: await this.historicalRepo.countMirror({mirrorId: id}),
            gaps,
            jobs: await this.jobRepo.findByMirror(id),
            task: this.tasks.get(id),
        };
    }

    rename = async (id: number, name: string): Promise<PlayMirrorSelect> => {
        await this.getOrThrow(id);
        const mirror = await this.mirrorRepo.updateById(id, {name}) as PlayMirrorSelect;
        this.emit(mirror, {name});
        return mirror;
    }

    /**
     * Compact or delete a mirror's plays, all of them or only those in `range`, in the background.
     *
     * * compact => raw upstream data is removed, plays stay and can still be exported
     * * delete => coverage is removed first, so a later import fetches the range again, then the plays are deleted
     *
     * Throws JobConflictError if a job using the mirror is running or another cleanup is.
     * */
    startCleanup = async (id: number, opts: {action: CleanupAction, range?: TimeRange, holder?: string}): Promise<StartedTask> => {
        const {action, range} = opts;
        const mirror = await this.getOrThrow(id);
        const release = await this.acquire(mirror, opts.holder, async (jobs) => {
            const active = jobs.filter(x => this.deps.isJobActive(x.id));
            if (active.length > 0) {
                throw new JobConflictError(`Stop the import and exports of ${active.map(x => `'${x.name}'`).join(', ')} first`);
            }
        });
        return this.run(mirror, {kind: 'cleanup', action, range, done: 0, total: 0, startedAt: dayjs().toISOString()}, release, async (task, signal) => {
            task.total = await this.historicalRepo.countMirror({mirrorId: id, range, uncompacted: action === 'compact'});
            if (action === 'delete') {
                // first, so an interrupted delete never claims plays that are gone
                const coverage = await this.mirrorRepo.removeCoverage(id, range);
                this.emit(mirror, {coverage});
            }
            await this.batches(mirror, task, signal, () => this.historicalRepo.findMirrorIds({mirrorId: id, range, uncompacted: action === 'compact', limit: this.batchSize}),
                (ids) => action === 'delete' ? this.historicalRepo.deleteWithInputs(ids) : this.historicalRepo.compactInputs(ids));
            this.logger.info(`Mirror ${id}: ${action === 'delete' ? 'deleted' : 'compacted'} ${task.done} plays${range !== undefined ? ` between ${dayjs(range[0]).toISOString()} and ${dayjs(range[1]).toISOString()}` : ''}`);
        });
    }

    /** Delete a mirror and all its plays in the background. Throws JobConflictError while any job uses it */
    startDelete = async (id: number): Promise<StartedTask> => {
        const mirror = await this.getOrThrow(id);
        const release = await this.acquire(mirror, undefined, async (jobs) => {
            if (jobs.length > 0) {
                throw new JobConflictError(`Used by ${jobs.length} job${jobs.length === 1 ? '' : 's'} (${jobs.map(x => `'${x.name}'`).join(', ')}). Delete them first`);
            }
        });
        return this.run(mirror, {kind: 'delete', done: 0, total: 0, startedAt: dayjs().toISOString()}, release, async (task, signal) => {
            task.total = await this.historicalRepo.countMirror({mirrorId: id});
            await this.mirrorRepo.removeCoverage(id);
            await this.batches(mirror, task, signal, () => this.historicalRepo.findMirrorIds({mirrorId: id, limit: this.batchSize}), (ids) => this.historicalRepo.deleteWithInputs(ids));
            const jobs = await this.jobRepo.findByMirror(id);
            if (jobs.length > 0) {
                // created while deleting. The plays are gone, the mirror stays for that job
                throw new JobConflictError(`Job '${jobs[0].name}' was created on this mirror while it was being deleted`);
            }
            await this.mirrorRepo.deleteByIds([id]);
            this.logger.info(`Mirror ${id} deleted with ${task.done} plays`);
            this.deps.emitter.emit('mirrorDeleted', {mirrorId: id, userId: mirror.userId});
        });
    }

    /** Stop running tasks between batches. They are idempotent, starting again finishes the work */
    shutdown = async () => {
        for (const abort of this.aborts.values()) {
            abort.abort(new Error('Shutting down'));
        }
    }

    protected async getOrThrow(id: number): Promise<PlayMirrorSelect> {
        const mirror = await this.mirrorRepo.getById(id);
        if (mirror === undefined) {
            throw new Error(`Mirror ${id} does not exist`);
        }
        return mirror;
    }

    /**
     * Take the mirror's lock, then run `check` with the jobs using the mirror. Locked first so no job can start in between.
     * Returns the release function. Releases and rethrows if check throws.
     *
     * With `existingHolder` the caller already holds the lock and has done its own checks: check is skipped and the lock is not released.
     * */
    protected async acquire(mirror: PlayMirrorSelect, existingHolder: string | undefined, check: (jobs: JobSelect[]) => Promise<void>): Promise<() => void> {
        const key = mirrorLockKey(mirror.id);
        if (existingHolder !== undefined) {
            if (this.deps.locks.holder(key) !== existingHolder) {
                throw new JobConflictError('A cleanup is already running for this mirror');
            }
            return () => undefined;
        }
        const holder = `mirror-cleanup:${randomUUID()}`;
        if (!this.deps.locks.tryAcquire(key, holder)) {
            throw new JobConflictError('A cleanup is already running for this mirror');
        }
        const release = () => this.deps.locks.release(key, holder);
        try {
            await check(await this.jobRepo.findByMirror(mirror.id));
        } catch (e) {
            release();
            throw e;
        }
        return release;
    }

    protected run(mirror: PlayMirrorSelect, task: MirrorTask, release: () => void, fn: (task: MirrorTask, signal: AbortSignal) => Promise<void>): StartedTask {
        const abort = new AbortController();
        this.tasks.set(mirror.id, task);
        this.aborts.set(mirror.id, abort);
        this.emit(mirror, {task});
        const done = (async () => {
            let error: string | undefined;
            try {
                await fn(task, abort.signal);
            } catch (e) {
                if (abort.signal.aborted) {
                    error = 'Interrupted by shutdown';
                } else {
                    this.logger.error(new Error(`Mirror ${mirror.id} ${task.kind} failed`, {cause: e}));
                    error = (e as Error).message;
                }
            } finally {
                this.tasks.delete(mirror.id);
                this.aborts.delete(mirror.id);
                release();
            }
            this.emit(mirror, {task: null, taskResult: {...task, error}});
            return {error};
        })();
        return {done};
    }

    protected async batches(mirror: PlayMirrorSelect, task: MirrorTask, signal: AbortSignal, next: () => Promise<number[]>, apply: (ids: number[]) => Promise<void>) {
        while (true) {
            signal.throwIfAborted();
            const ids = await next();
            if (ids.length === 0) {
                return;
            }
            await apply(ids);
            task.done += ids.length;
            this.emit(mirror, {task});
        }
    }

    protected emit(mirror: Pick<PlayMirrorSelect, 'id' | 'userId'>, data: Record<string, unknown>) {
        this.deps.emitter.emit('mirrorUpdate', {mirrorId: mirror.id, userId: mirror.userId, data});
    }
}
