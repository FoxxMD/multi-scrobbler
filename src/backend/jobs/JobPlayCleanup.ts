import { childLogger, type Logger } from "@foxxmd/logging";
import { randomUUID } from "node:crypto";
import type { DbConcrete } from "../common/database/drizzle/drizzleUtils.ts";
import type { PlayWith } from "../common/database/drizzle/drizzleTypes.ts";
import { JobTargetRepository } from "../common/database/drizzle/repositories/JobTargetRepository.ts";
import { DrizzlePlayRepository, type JobPlayFilter } from "../common/database/drizzle/repositories/PlayRepository.ts";
import type { WildcardEmitter } from "../common/WildcardEmitter.ts";
import { componentLockKey, JobConflictError } from "./JobRunner.ts";
import type { LockRegistry } from "./LockRegistry.ts";
import type { CleanupAction } from "./MirrorService.ts";

/** The parts of a Client a job play cleanup uses */
export interface CleanupClient {
    cancelQueuedPlay(play: PlayWith<'queueStates' | 'events'>): Promise<void>
    /** recount queue stats after bulk changes and send them to the UI */
    refreshQueueStats(): Promise<void>
}

export const isCleanupClient = (c: object | undefined): c is CleanupClient => c !== undefined
    && typeof (c as Partial<CleanupClient>).cancelQueuedPlay === 'function'
    && typeof (c as Partial<CleanupClient>).refreshQueueStats === 'function';

export interface JobPlayCleanupOpts {
    componentId: number
    /** undefined => every job play of the Client, including plays of deleted jobs */
    jobId?: number
    /**
     * Plays still in the Client's queue (queued, or failed with retries left):
     *
     * * cancel => dequeue them first, then clean them up with the rest
     * * skip => leave them alone and report them as skipped
     * */
    queued: 'cancel' | 'skip'
    action: CleanupAction
    /** the caller already holds the Client's lock with this holder, and releases it */
    holder?: string
    onProgress?: (progress: JobPlayCleanupProgress) => void
}

export interface JobPlayCleanupProgress {
    action: CleanupAction
    done: number
    total: number
}

export interface JobPlayCleanupResult extends JobPlayCleanupProgress {
    cancelled: number
    skipped: number
}

export interface JobPlayCleanupDeps {
    /** a getter, so tests that repoint the JobManager's db also repoint this */
    readonly db: DbConcrete
    logger: Logger
    locks: LockRegistry
    emitter: WildcardEmitter
    resolveClient: (componentId: number) => object | undefined
    batchSize?: number
}

/**
 * Compacts or deletes the plays import jobs created in a Client (D11-B, D13).
 *
 * Holds the `component:{id}` lock, so exports to the Client wait until it finishes.
 * Job targets' stats are snapshotted first so job pages keep their numbers.
 * Scrobble counters are never decremented.
 * */
export class JobPlayCleanup {

    protected deps: JobPlayCleanupDeps;
    protected logger: Logger;

    constructor(deps: JobPlayCleanupDeps) {
        this.deps = deps;
        this.logger = childLogger(deps.logger, 'Job Plays');
    }

    protected get batchSize() {
        return this.deps.batchSize ?? 1000;
    }

    /** Throws JobConflictError if another cleanup of the Client is running */
    run = async (opts: JobPlayCleanupOpts): Promise<JobPlayCleanupResult> => {
        const {componentId, jobId, queued, action, onProgress} = opts;
        const key = componentLockKey(componentId);
        const holder = opts.holder ?? `job-plays:${randomUUID()}`;
        if (!this.deps.locks.tryAcquire(key, holder)) {
            throw new JobConflictError('A cleanup is already running for this Client');
        }
        try {
            const playRepo = new DrizzlePlayRepository(this.deps.db, {logger: this.logger, componentId});
            await this.snapshotStats(componentId, jobId);

            const client = this.deps.resolveClient(componentId);
            const canCancel = queued === 'cancel' && isCleanupClient(client);
            let cancelled = 0;
            if (canCancel) {
                cancelled = await this.cancelQueued(playRepo, client, {componentId, jobId});
            }

            const filter: JobPlayFilter = {componentId, jobId, inQueue: false, uncompacted: action === 'compact'};
            const result: JobPlayCleanupResult = {action, done: 0, total: await playRepo.countJobPlays(filter), cancelled, skipped: 0};
            onProgress?.(result);
            let afterId: number | undefined;
            while (true) {
                const ids = await playRepo.findJobPlayIds({...filter, afterId, limit: this.batchSize});
                if (ids.length === 0) {
                    break;
                }
                if (action === 'delete') {
                    await playRepo.deleteByIds(ids);
                } else {
                    await playRepo.compactPlays(ids, ['input', 'transform']);
                }
                afterId = ids[ids.length - 1];
                result.done += ids.length;
                onProgress?.({action, done: result.done, total: result.total});
            }
            result.skipped = await playRepo.countJobPlays({componentId, jobId, inQueue: true});

            if (isCleanupClient(client)) {
                await client.refreshQueueStats();
            }
            this.deps.emitter.emit('playsPurged', {componentId});
            this.logger.info(`Client ${componentId}${jobId !== undefined ? `, Job ${jobId}` : ''}: ${action === 'delete' ? 'deleted' : 'compacted'} ${result.done} job plays, ${cancelled} dequeued, ${result.skipped} still queued and skipped`);
            return result;
        } finally {
            if (opts.holder === undefined) {
                this.deps.locks.release(key, holder);
            }
        }
    }

    /** Job pages show target stats from plays in the Client, save them before the plays are gone */
    protected async snapshotStats(componentId: number, jobId?: number) {
        const targetRepo = new JobTargetRepository(this.deps.db, {logger: this.logger});
        const targets = jobId !== undefined
            ? (await targetRepo.findByJob(jobId)).filter(x => x.componentId === componentId)
            : await targetRepo.findByComponent(componentId);
        for (const t of targets) {
            if (t.status === 'completed' && t.stats !== null) {
                // snapshotted on completion. Recounting after an earlier cleanup would undercount
                continue;
            }
            const stats = (await targetRepo.playStats(t.jobId, componentId)).get(componentId);
            if (stats !== undefined) {
                await targetRepo.update(t.id, {stats});
            }
        }
    }

    protected async cancelQueued(playRepo: DrizzlePlayRepository, client: CleanupClient, filter: Omit<JobPlayFilter, 'inQueue'>): Promise<number> {
        let cancelled = 0;
        let afterId: number | undefined;
        while (true) {
            const ids = await playRepo.findJobPlayIds({...filter, inQueue: true, afterId, limit: this.batchSize});
            if (ids.length === 0) {
                return cancelled;
            }
            for (const id of ids) {
                const entity = await playRepo.findByIdWith<'queueStates' | 'events'>(id, ['queues', 'events']);
                if (entity === undefined) {
                    continue;
                }
                try {
                    await client.cancelQueuedPlay(entity);
                    cancelled++;
                } catch (e) {
                    // IE the client dequeued it in the meantime
                    this.logger.warn(new Error(`Could not dequeue job play ${id}`, {cause: e}));
                }
            }
            afterId = ids[ids.length - 1];
        }
    }
}
