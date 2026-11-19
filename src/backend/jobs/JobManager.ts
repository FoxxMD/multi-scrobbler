import { childLogger, type Logger } from "@foxxmd/logging";
import path from "node:path";
import { getDataDir } from "../common/index.ts";
import type { DbConcrete } from "../common/database/drizzle/drizzleUtils.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import type { WebhookPayload } from "../common/infrastructure/config/health/webhooks.ts";
import { WildcardEmitter } from "../common/WildcardEmitter.ts";
import type { JobTimings } from "./constants.ts";
import type { ImportPacer, ImportProvider } from "./ImportProvider.ts";
import { type ExportClient, type HaltStatus, JobRunner, type JobRuntime } from "./JobRunner.ts";
import { JobTargetRepository } from "../common/database/drizzle/repositories/JobTargetRepository.ts";
import { LockRegistry } from "./LockRegistry.ts";
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
        return this.getRunner(jobId).startImport();
    }

    stopImport = async (jobId: number, status: HaltStatus) => this.getRunner(jobId).stopImport(status);

    startExport = async (jobId: number, targetId: number) => {
        if(this.shuttingDown) {
            return;
        }
        return this.getRunner(jobId).startExport(targetId);
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
        await Promise.allSettled(Array.from(this.runners.values()).map(x => x.shutdown()));
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
