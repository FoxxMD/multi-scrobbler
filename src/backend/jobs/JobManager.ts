import { childLogger, type Logger } from "@foxxmd/logging";
import path from "node:path";
import { getDataDir } from "../common/index.ts";
import type { DbConcrete } from "../common/database/drizzle/drizzleUtils.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import type { WebhookPayload } from "../common/infrastructure/config/health/webhooks.ts";
import { WildcardEmitter } from "../common/WildcardEmitter.ts";
import type { JobTimings } from "./constants.ts";
import type { ImportPacer, ImportProvider } from "./ImportProvider.ts";
import { componentLockKey, type ExportClient, type HaltStatus, JobConflictError, JobRunner, type JobRuntime, mirrorLockKey } from "./JobRunner.ts";
import { JobTargetRepository } from "../common/database/drizzle/repositories/JobTargetRepository.ts";
import { LockRegistry } from "./LockRegistry.ts";
import { type CleanupAction, lockedMessage, MirrorService, type StartedTask } from "./MirrorService.ts";
import { MirrorRepository } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import { JobPlayCleanup, type JobPlayCleanupProgress, type JobPlayCleanupResult } from "./JobPlayCleanup.ts";
import { randomUUID } from "node:crypto";
import { DrizzlePlayRepository } from "../common/database/drizzle/repositories/PlayRepository.ts";
import { type ClientJobPlaysSummaryJson, isLockedMirror } from "../../core/Job.ts";
import { LastfmFileImportProvider } from "./lastfm/LastfmFileImportProvider.ts";
import { LastfmApiImportProvider, type LastfmImportSource } from "./lastfm/LastfmApiImportProvider.ts";
import LastfmApiClient from "../common/vendor/LastfmApiClient.ts";
import pMap from "p-map";
import type * as z from "zod";
import type { JobTransformSource, jobTransformsSchema } from "../../core/Job.ts";
import type { PlayTransformPartsConfigOptions } from "../../core/Transform.ts";
import type TransformerManager from "../common/transforms/TransformerManager.ts";
import { getRoot } from "../ioc.ts";

export interface JobManagerOpts {
    db: DbConcrete
    logger: Logger
    /** returns undefined for mirror-only jobs, throws if the job's import origin can't be used. Defaults to Last.fm file/API providers */
    createProvider?: (job: JobSelect) => ImportProvider | undefined
    /** used by the default provider factory to find a job's Last.fm Source/Client */
    resolveComponent?: ComponentResolver
    /** finds the running Client a job exports to */
    resolveClient?: (componentId: number) => ExportClient | undefined
    /** where uploaded export files are stored and where users can place their own. Defaults to {dataDir}/imports */
    importsDir?: string
    notify?: (payload: WebhookPayload) => Promise<void>
    timings?: Partial<JobTimings>
    pacer?: ImportPacer
    /** validated transformersPresets from the config. Defaults to the root container's */
    transformersPresets?: Record<string, PlayTransformPartsConfigOptions>
    /** validates job transform stages. Defaults to the root container's */
    transformerManager?: TransformerManager
    /** plays per cleanup batch. Default 1000 */
    cleanupBatchSize?: number
}

/** A job's configuration can't be used (IE its Last.fm component is gone). The user has to fix something, retrying won't help */
export class JobConfigError extends Error {
    name = 'JobConfigError';
}

/** Uploaded files live here, separate from files users place in the imports folder themselves */
export const jobUploadsDir = (jobs: {importsDir: string}) => path.join(jobs.importsDir, 'uploads');

/** Anything that can resolve a live Source/Client instance by its db component id */
export type ComponentResolver = (componentId: number) => object | undefined;

/** Last.fm only. Libre.fm uses the same api client but would need its own mirror service */
export const isLastfmImportSource = (c: object | undefined): c is LastfmImportSource => c !== undefined && 'type' in c && c.type === 'lastfm' && 'api' in c && c.api instanceof LastfmApiClient && 'isReady' in c;

/** A component's raw playTransform stages for a hook, always as a list. undefined if it has none */
export const componentHookStages = (component: object | undefined, hook: 'preCompare' | 'postCompare'): unknown[] | undefined => {
    const raw = (component as {config?: {options?: {playTransform?: Record<string, unknown>}}} | undefined)?.config?.options?.playTransform?.[hook];
    if (raw === undefined || raw === null) {
        return undefined;
    }
    const list = Array.isArray(raw) ? raw : [raw];
    return list.length > 0 ? list : undefined;
}

export const createDefaultProvider = (job: JobSelect, resolveComponent: ComponentResolver): ImportProvider | undefined => {
    if(job.importFile !== null) {
        return new LastfmFileImportProvider(job.importFile, [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()]);
    }
    if(job.componentFromId === null) {
        return undefined;
    }
    const component = resolveComponent(job.componentFromId);
    if(component === undefined) {
        throw new JobConfigError(`The Source/Client to import from (component ${job.componentFromId}) is not configured`);
    }
    if(!isLastfmImportSource(component)) {
        throw new JobConfigError(`Component ${job.componentFromId} is not a Last.fm Source or Client`);
    }
    return new LastfmApiImportProvider(component);
}

/**
 * Owns a JobRunner per job, shared locks, and the emitter the API forwards to SSE as `jobUpdate`.
 * */
export class JobManager {

    readonly emitter = new WildcardEmitter();
    readonly locks = new LockRegistry();
    readonly importsDir: string;
    readonly mirrors: MirrorService;
    readonly jobPlays: JobPlayCleanup;
    /** job play cleanups of a whole Client (D13), by component id */
    protected clientCleanups = new Map<number, JobPlayCleanupProgress>();
    /** not readonly so tests can point it at the server's db after init */
    db: DbConcrete;
    protected runners = new Map<number, JobRunner>();
    protected opts: JobManagerOpts;
    protected logger: Logger;
    protected shuttingDown = false;

    constructor(opts: JobManagerOpts) {
        this.opts = opts;
        this.logger = childLogger(opts.logger, 'Jobs');
        this.importsDir = opts.importsDir ?? path.join(getDataDir(), 'imports');
        this.db = opts.db;
        const getDb = () => this.db;
        this.mirrors = new MirrorService({
            batchSize: opts.cleanupBatchSize,
            get db() { return getDb(); },
            logger: this.logger,
            locks: this.locks,
            emitter: this.emitter,
            isJobActive: (jobId) => this.isJobActive(jobId),
        });
        this.jobPlays = new JobPlayCleanup({
            batchSize: opts.cleanupBatchSize,
            get db() { return getDb(); },
            logger: this.logger,
            locks: this.locks,
            emitter: this.emitter,
            resolveClient: (id) => this.opts.resolveClient?.(id),
        });
    }

    /** true while the job's import or any of its exports is running in this process */
    isJobActive(jobId: number): boolean {
        const runner = this.runners.get(jobId);
        return runner !== undefined && (runner.importRunning || runner.exportsRunning.length > 0);
    }

    resolveComponent(componentId: number): object | undefined {
        return this.opts.resolveComponent?.(componentId);
    }

    protected get jobRepo() {
        return new JobRepository(this.db, {logger: this.logger});
    }

    protected get targetRepo() {
        return new JobTargetRepository(this.db, {logger: this.logger});
    }

    protected get transformerManager(): TransformerManager {
        return this.opts.transformerManager ?? getRoot().items.transformerManager;
    }

    getRunner(jobId: number): JobRunner {
        let runner = this.runners.get(jobId);
        if(runner === undefined) {
            runner = new JobRunner(jobId, {
                db: this.db,
                logger: this.logger,
                locks: this.locks,
                emitter: this.emitter,
                createProvider: this.opts.createProvider ?? ((job) => createDefaultProvider(job, this.opts.resolveComponent ?? (() => undefined))),
                notify: this.opts.notify !== undefined ? (p) => this.opts.notify!({...p, identifier: 'Jobs'}) : undefined,
                timings: this.opts.timings,
                pacer: this.opts.pacer,
                resolveClient: this.opts.resolveClient,
                replaceConflicts: async (job, range) => {
                    const others = (await this.jobRepo.findByMirror(job.mirrorId)).filter(x => x.id !== job.id);
                    return others.filter(x => {
                        const exporting = (this.runners.get(x.id)?.exportsRunning.length ?? 0) > 0;
                        return exporting && (x.rangeFrom?.valueOf() ?? 0) <= range[1] && x.rangeTo.valueOf() >= range[0];
                    }).map(x => x.name);
                },
                deleteMirrorRange: async (mirrorId, range, holder, signal) => (await this.mirrors.startCleanup(mirrorId, {action: 'delete', range, holder, signal})).done,
                parseStages: async (raw) => {
                    try {
                        return await pMap(raw, async (x) => this.transformerManager.parseTransformerConfig(x));
                    } catch (e) {
                        throw new JobConfigError(`Invalid transform stage: ${(e as Error).message}`, {cause: e});
                    }
                },
            });
            this.runners.set(jobId, runner);
        }
        return runner;
    }

    get transformersPresets(): Record<string, PlayTransformPartsConfigOptions> {
        return this.opts.transformersPresets ?? getRoot().items.transformersPresets;
    }

    /**
     * Copies a job's transform stages from a preset or a component's hook and checks every stage is usable.
     * Throws JobConfigError if the source doesn't exist or a stage is invalid.
     * */
    resolveTransforms = async (input: z.infer<typeof jobTransformsSchema>): Promise<{transformOptions: unknown[], transformSource: JobTransformSource}> => {
        let stages: unknown[];
        let transformSource: JobTransformSource;
        if ('preset' in input) {
            const preset = this.transformersPresets[input.preset];
            if (preset === undefined) {
                throw new JobConfigError(`Transformers preset '${input.preset}' does not exist`);
            }
            stages = Array.isArray(preset) ? preset : [preset];
            transformSource = {kind: 'preset', name: input.preset};
        } else {
            const component = this.resolveComponent(input.componentId);
            if (component === undefined) {
                throw new JobConfigError(`Source/Client ${input.componentId} is not configured`);
            }
            const hookStages = componentHookStages(component, input.hook);
            if (hookStages === undefined) {
                throw new JobConfigError(`Source/Client ${input.componentId} has no ${input.hook} transforms`);
            }
            stages = hookStages;
            transformSource = {kind: 'component', componentId: input.componentId, componentName: (component as {name?: string}).name ?? String(input.componentId), hook: input.hook};
        }
        if (stages.length === 0) {
            throw new JobConfigError('Transforms must have at least one stage');
        }
        const tm = this.transformerManager;
        try {
            await pMap(stages, async (x) => tm.parseTransformerConfig(x));
        } catch (e) {
            throw new JobConfigError(`Invalid transform stage: ${(e as Error).message}`, {cause: e});
        }
        return {transformOptions: stages, transformSource};
    }

    getRuntime(jobId: number): JobRuntime | undefined {
        return this.runners.get(jobId)?.runtime;
    }

    startImport = async (jobId: number) => {
        if(this.shuttingDown) {
            return;
        }
        const runner = this.getRunner(jobId);
        this.assertNotDeleting(runner);
        return runner.startImport();
    }

    stopImport = async (jobId: number, status: HaltStatus) => this.getRunner(jobId).stopImport(status);

    startExport = async (jobId: number, targetId: number) => {
        if(this.shuttingDown) {
            return;
        }
        const runner = this.getRunner(jobId);
        this.assertNotDeleting(runner);
        return runner.startExport(targetId);
    }

    stopExport = async (jobId: number, targetId: number, status: HaltStatus) => this.getRunner(jobId).stopExport(targetId, status);

    /** Start the import and every export. Throws the first error after trying them all */
    startJob = async (jobId: number) => {
        const errors: unknown[] = [];
        for(const start of [() => this.startImport(jobId), ...(await this.targetRepo.findByJob(jobId)).map(t => () => this.startExport(jobId, t.id))]) {
            try {
                await start();
            } catch (e) {
                errors.push(e);
            }
        }
        if(errors.length > 0) {
            throw errors[0];
        }
    }

    /** Make the job's exports re-check now, IE after its queue limit changed */
    wake = (jobId: number) => this.runners.get(jobId)?.wake();

    stopJob = async (jobId: number, status: HaltStatus) => {
        await this.stopImport(jobId, status);
        for(const t of await this.targetRepo.findByJob(jobId)) {
            await this.stopExport(jobId, t.id, status);
        }
    }

    protected assertNotDeleting(runner: JobRunner) {
        if (runner.runtime.deleting === true) {
            throw new JobConflictError('The job is being deleted');
        }
    }

    protected assertNoJobCleanup(runner: JobRunner) {
        this.assertNotDeleting(runner);
        if (runner.runtime.cleanup !== undefined) {
            throw new JobConflictError('A cleanup is already running for this job');
        }
    }

    /** Take every Client's cleanup lock or none. Returns the release function */
    protected acquireClients(componentIds: number[], holder: string): () => void {
        const keys = componentIds.map(componentLockKey);
        const release = () => keys.forEach(k => this.locks.release(k, holder));
        for (const key of keys) {
            if (!this.locks.tryAcquire(key, holder)) {
                release();
                throw new JobConflictError('A cleanup is already running for one of the Clients');
            }
        }
        return release;
    }

    /**
     * Compact or delete the scrobbles a job created in its Clients, in the background (D11-B).
     * Plays still queued in a Client are dequeued first.
     * Throws JobConflictError while any of the job's exports runs.
     * */
    cleanupJobScrobbles = async (jobId: number, action: CleanupAction): Promise<StartedTask> => {
        const targets = await this.targetRepo.findByJob(jobId);
        const runner = this.getRunner(jobId);
        if (runner.exportsRunning.length > 0) {
            throw new JobConflictError('Stop the job\'s exports first');
        }
        this.assertNoJobCleanup(runner);
        const holder = `job-cleanup:${jobId}:${randomUUID()}`;
        const release = this.acquireClients(targets.map(x => x.componentId), holder);
        runner.setCleanup({action, done: 0, total: 0});
        const done = (async () => {
            let error: string | undefined;
            try {
                for (const t of targets) {
                    await this.jobPlays.run({componentId: t.componentId, jobId, queued: 'cancel', action, holder, onProgress: (p) => runner.setCleanup({...p, componentId: t.componentId})});
                }
            } catch (e) {
                this.logger.error(new Error(`Cleanup of Job ${jobId} scrobbles failed`, {cause: e}));
                error = (e as Error).message;
            } finally {
                release();
                runner.setCleanup(undefined);
            }
            return {error};
        })();
        return {done};
    }

    /** Compact or delete a job's mirror data in its range, in the background (D11-A) */
    cleanupJobHistorical = async (jobId: number, action: CleanupAction): Promise<StartedTask> => {
        const job = await this.jobRepo.getById(jobId);
        if (job === undefined) {
            throw new Error(`Job ${jobId} does not exist`);
        }
        return this.mirrors.startCleanup(job.mirrorId, {action, range: [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()]});
    }

    /** Counts of a Client's job plays, and what blocks or runs a cleanup of them */
    clientJobPlaysSummary = async (componentId: number): Promise<ClientJobPlaysSummaryJson> => {
        const repo = new DrizzlePlayRepository(this.db, {logger: this.logger, componentId});
        const total = await repo.countJobPlays({componentId});
        const exporting = (await this.targetRepo.findByComponent(componentId)).filter(t => this.runners.get(t.jobId)?.exportsRunning.includes(t.id) === true);
        return {
            total,
            queued: await repo.countJobPlays({componentId, inQueue: true}),
            orphaned: await repo.countJobPlays({componentId, orphaned: true}),
            compacted: total - await repo.countJobPlays({componentId, uncompacted: true}),
            exportingJobs: await Promise.all(exporting.map(async t => ({id: t.jobId, name: (await this.jobRepo.getById(t.jobId))?.name ?? String(t.jobId)}))),
            task: this.clientCleanups.get(componentId) ?? null,
        };
    }

    getClientCleanup(componentId: number): JobPlayCleanupProgress | undefined {
        return this.clientCleanups.get(componentId);
    }

    /**
     * Compact or delete every job play of a Client that is not queued, including plays of deleted jobs, in the background (D13).
     * Throws JobConflictError while any job exports to the Client.
     * */
    cleanupClientJobPlays = async (componentId: number, action: CleanupAction): Promise<StartedTask> => {
        const targets = await this.targetRepo.findByComponent(componentId);
        const exporting = targets.filter(t => this.runners.get(t.jobId)?.exportsRunning.includes(t.id) === true);
        if (exporting.length > 0) {
            const names = await Promise.all(exporting.map(async t => (await this.jobRepo.getById(t.jobId))?.name ?? String(t.jobId)));
            throw new JobConflictError(`Stop exports to this Client first (${names.map(x => `'${x}'`).join(', ')})`);
        }
        const holder = `client-cleanup:${componentId}:${randomUUID()}`;
        const release = this.acquireClients([componentId], holder);
        const emit = (data: Record<string, unknown>) => this.emitter.emit('clientJobPlaysUpdate', {componentId, data});
        const progress = (p: JobPlayCleanupProgress) => {
            this.clientCleanups.set(componentId, p);
            emit({task: p});
        }
        progress({action, done: 0, total: 0});
        const done = (async () => {
            let result: JobPlayCleanupResult | undefined;
            let error: string | undefined;
            try {
                result = await this.jobPlays.run({componentId, queued: 'skip', action, holder, onProgress: progress});
            } catch (e) {
                this.logger.error(new Error(`Cleanup of job plays in Client ${componentId} failed`, {cause: e}));
                error = (e as Error).message;
            } finally {
                release();
                this.clientCleanups.delete(componentId);
            }
            emit({task: null, taskResult: {...result, error}});
            return {error};
        })();
        return {done};
    }

    /** Restart every process that was running when the app last stopped */
    resumeAll = async () => {
        const running = await this.jobRepo.findRunningImports();
        if(running.length > 0) {
            this.logger.info(`Resuming ${running.length} job imports`);
        }
        for(const job of running) {
            try {
                await this.startImport(job.id);
            } catch (e) {
                this.logger.warn(new Error(`Could not resume import for Job ${job.id}`, {cause: e}));
                await this.jobRepo.update(job.id, {importStatus: 'failed', importError: e as Error});
            }
        }
        const targets = await this.targetRepo.findRunning();
        if(targets.length > 0) {
            this.logger.info(`Resuming ${targets.length} job exports`);
        }
        for(const t of targets) {
            try {
                await this.startExport(t.jobId, t.id);
            } catch (e) {
                this.logger.warn(new Error(`Could not resume export ${t.id} for Job ${t.jobId}`, {cause: e}));
                await this.targetRepo.update(t.id, {status: 'failed', error: e as Error});
            }
        }
    }

    /** Halts everything without changing persisted status, so running processes resume on next boot */
    shutdown = async () => {
        this.shuttingDown = true;
        // runners first: a replace import aborts its own mirror delete and stays resumable instead of failing on the delete's error
        const runners = Promise.allSettled(Array.from(this.runners.values()).map(x => x.shutdown()));
        await this.mirrors.shutdown();
        await runners;
    }

    /**
     * Delete a job and clean up its data, in the background. Every guard is checked before anything changes.
     *
     * Order: stop the job, clean up its scrobbles in each Client (queued ones are dequeued), clean up mirror data in its range, delete the job.
     * Ends with `jobDeleted`. On failure the job is kept and `deleteError` is sent.
     * */
    deleteJobWithCleanup = async (jobId: number, opts: {historical: CleanupAction | 'keep', scrobbles: CleanupAction | 'keep'}): Promise<StartedTask> => {
        const {historical, scrobbles} = opts;
        const job = await this.jobRepo.getById(jobId);
        if (job === undefined) {
            throw new Error(`Job ${jobId} does not exist`);
        }
        if (historical !== 'keep') {
            const mirror = await new MirrorRepository(this.db, {logger: this.logger}).getById(job.mirrorId);
            if (mirror !== undefined && isLockedMirror(mirror)) {
                throw new JobConflictError(lockedMessage(mirror));
            }
        }
        const targets = scrobbles === 'keep' ? [] : await this.targetRepo.findByJob(jobId);
        const otherJobs = historical === 'keep' ? [] : (await this.jobRepo.findByMirror(job.mirrorId)).filter(x => x.id !== jobId);

        // checked and locked without awaiting in between, so nothing can start after the checks pass
        const runner = this.getRunner(jobId);
        this.assertNoJobCleanup(runner);
        const busy = otherJobs.filter(x => this.isJobActive(x.id));
        if (busy.length > 0) {
            throw new JobConflictError(`Mirror data can't be cleaned up while ${busy.map(x => `'${x.name}'`).join(', ')} uses it. Stop its import and exports first`);
        }
        const holder = `job-delete:${jobId}:${randomUUID()}`;
        const release = this.acquireClients(targets.map(x => x.componentId), holder);
        const mirrorKey = mirrorLockKey(job.mirrorId);
        if (historical !== 'keep') {
            if (!this.locks.tryAcquire(mirrorKey, holder)) {
                release();
                throw new JobConflictError('A cleanup is already running for this job\'s mirror');
            }
        }
        const releaseAll = () => {
            release();
            this.locks.release(mirrorKey, holder);
        }

        runner.setDeleting(true);
        const done = (async () => {
            try {
                await this.stopJob(jobId, 'stopped');
                if (scrobbles !== 'keep') {
                    for (const t of targets) {
                        const result = await this.jobPlays.run({componentId: t.componentId, jobId, queued: 'cancel', action: scrobbles, holder, onProgress: (p) => runner.setCleanup({...p, componentId: t.componentId})});
                        if (result.skipped > 0) {
                            // deleting the job would unlink them and they would still be scrobbled
                            throw new Error(`${result.skipped} scrobbles could not be removed from the queue of Client ${t.componentId}`);
                        }
                    }
                    runner.setCleanup(undefined);
                }
                if (historical !== 'keep') {
                    const {error} = await (await this.mirrors.startCleanup(job.mirrorId, {action: historical, range: [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()], holder})).done;
                    if (error !== undefined) {
                        throw new Error(`Mirror cleanup failed: ${error}`);
                    }
                }
                // still locked, so nothing exports into the Clients or imports into the mirror before the job is gone
                await this.deleteJob(jobId);
                releaseAll();
                return {};
            } catch (e) {
                releaseAll();
                this.logger.error(new Error(`Deleting Job ${jobId} failed`, {cause: e}));
                runner.setCleanup(undefined);
                runner.setDeleting(false, (e as Error).message);
                return {error: (e as Error).message};
            }
        })();
        return {done};
    }

    deleteJob = async (jobId: number) => {
        const userId = (await this.jobRepo.getById(jobId))?.userId;
        const runner = this.runners.get(jobId);
        if(runner !== undefined) {
            await runner.stopImport('stopped');
            await runner.shutdown();
            this.runners.delete(jobId);
        }
        await this.jobRepo.deleteJob(jobId);
        this.emitter.emit('jobDeleted', {jobId, userId});
    }
}
