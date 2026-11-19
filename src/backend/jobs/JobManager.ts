import { childLogger, type Logger } from "@foxxmd/logging";
import type { DbConcrete } from "../common/database/drizzle/drizzleUtils.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import type { WebhookPayload } from "../common/infrastructure/config/health/webhooks.ts";
import { WildcardEmitter } from "../common/WildcardEmitter.ts";
import type { JobTimings } from "./constants.ts";
import type { ImportPacer, ImportProvider } from "./ImportProvider.ts";
import { type HaltStatus, JobRunner, type JobRuntime } from "./JobRunner.ts";
import { LockRegistry } from "./LockRegistry.ts";
import { LastfmFileImportProvider } from "./lastfm/LastfmFileImportProvider.ts";
import { LastfmApiImportProvider, type LastfmImportSource } from "./lastfm/LastfmApiImportProvider.ts";
import LastfmApiClient from "../common/vendor/LastfmApiClient.ts";

export interface JobManagerOpts {
    db: DbConcrete
    logger: Logger
    /** returns undefined for mirror-only jobs, throws if the job's import origin can't be used. Defaults to Last.fm file/API providers */
    createProvider?: (job: JobSelect) => ImportProvider | undefined
    /** used by the default provider factory to find a job's Last.fm Source/Client */
    resolveComponent?: ComponentResolver
    notify?: (payload: WebhookPayload) => Promise<void>
    timings?: Partial<JobTimings>
    pacer?: ImportPacer
}

/** Anything that can resolve a live Source/Client instance by its db component id */
export type ComponentResolver = (componentId: number) => object | undefined;

/** Last.fm only. Libre.fm uses the same api client but would need its own mirror service */
export const isLastfmImportSource = (c: object | undefined): c is LastfmImportSource => c !== undefined && 'type' in c && c.type === 'lastfm' && 'api' in c && c.api instanceof LastfmApiClient && 'isReady' in c;

export const createDefaultProvider = (job: JobSelect, resolveComponent: ComponentResolver): ImportProvider | undefined => {
    if(job.importFile !== null) {
        return new LastfmFileImportProvider(job.importFile, [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()]);
    }
    if(job.componentFromId === null) {
        return undefined;
    }
    const component = resolveComponent(job.componentFromId);
    if(component === undefined) {
        throw new Error(`The Source/Client to import from (component ${job.componentFromId}) is not configured`);
    }
    if(!isLastfmImportSource(component)) {
        throw new Error(`Component ${job.componentFromId} is not a Last.fm Source or Client`);
    }
    return new LastfmApiImportProvider(component);
}

/**
 * Owns a JobRunner per job, shared locks, and the emitter the API forwards to SSE as `jobUpdate`.
 * */
export class JobManager {

    readonly emitter = new WildcardEmitter();
    readonly locks = new LockRegistry();
    protected runners = new Map<number, JobRunner>();
    protected opts: JobManagerOpts;
    protected logger: Logger;
    protected jobRepo: JobRepository;
    protected shuttingDown = false;

    constructor(opts: JobManagerOpts) {
        this.opts = opts;
        this.logger = childLogger(opts.logger, 'Jobs');
        this.jobRepo = new JobRepository(opts.db, {logger: this.logger});
    }

    getRunner(jobId: number): JobRunner {
        let runner = this.runners.get(jobId);
        if(runner === undefined) {
            runner = new JobRunner(jobId, {
                db: this.opts.db,
                logger: this.logger,
                locks: this.locks,
                emitter: this.emitter,
                createProvider: this.opts.createProvider ?? ((job) => createDefaultProvider(job, this.opts.resolveComponent ?? (() => undefined))),
                notify: this.opts.notify !== undefined ? (p) => this.opts.notify!({...p, identifier: 'Jobs'}) : undefined,
                timings: this.opts.timings,
                pacer: this.opts.pacer,
            });
            this.runners.set(jobId, runner);
        }
        return runner;
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
    }

    /** Halts everything without changing persisted status, so running processes resume on next boot */
    shutdown = async () => {
        this.shuttingDown = true;
        await Promise.allSettled(Array.from(this.runners.values()).map(x => x.shutdown()));
    }

    deleteJob = async (jobId: number) => {
        const runner = this.runners.get(jobId);
        if(runner !== undefined) {
            await runner.stopImport('stopped');
            await runner.shutdown();
            this.runners.delete(jobId);
        }
        await this.jobRepo.deleteJob(jobId);
        this.emitter.emit('jobDeleted', {jobId});
    }
}
