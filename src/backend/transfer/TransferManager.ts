import { Logger } from "@foxxmd/logging";
import { nanoid } from "nanoid";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import ScrobbleClients from "../scrobblers/ScrobbleClients.js";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import { TransferJob, TransferOptions, TransferProgress } from "./TransferJob.js";

export interface TransferJobInfo {
    id: string;
    options: TransferOptions;
    progress: TransferProgress;
}

export class TransferManager {
    private scheduler: ToadScheduler;
    private jobs: Map<string, { job: TransferJob; scheduledJob?: SimpleIntervalJob }>;
    private logger: Logger;
    private scrobbleSources: ScrobbleSources;
    private scrobbleClients: ScrobbleClients;

    // Keep completed jobs for 1 hour
    private readonly COMPLETED_JOB_TTL = 60 * 60 * 1000;

    constructor(
        scrobbleSources: ScrobbleSources,
        scrobbleClients: ScrobbleClients,
        logger: Logger
    ) {
        this.scheduler = new ToadScheduler();
        this.jobs = new Map();
        this.logger = logger;
        this.scrobbleSources = scrobbleSources;
        this.scrobbleClients = scrobbleClients;

        this.logger.info('Transfer Manager initialized');
    }

    public async startTransfer(options: TransferOptions): Promise<string> {
        this.validateTransferOptions(options);

        const id = nanoid();
        const job = new TransferJob(
            options,
            this.scrobbleSources,
            this.scrobbleClients,
            this.logger,
            id
        );

        // Create a long-running AsyncTask (not interval-based)
        const task = new AsyncTask(
            `transfer-${id}`,
            async () => {
                try {
                    await job.run();
                } catch (e) {
                    this.logger.error(`Transfer ${id} failed: ${e.message}`);
                } finally {
                    this.scheduleJobCleanup(id);
                }
            },
            (err: Error) => {
                this.logger.error(`Unexpected error in transfer ${id}:`, err);
                this.scheduleJobCleanup(id);
            }
        );

        this.jobs.set(id, { job, scheduledJob: undefined });

        const mode = options.fromDate || options.toDate ? 'date range' : `${options.playCount} plays`;
        this.logger.info(`Started transfer ${id}: ${options.sourceName} -> ${options.clientName} (${mode})`);

        // Execute the task directly (not as an interval job)
        task.execute();

        return id;
    }

    public getTransferStatus(id?: string): TransferJobInfo | TransferJobInfo[] {
        if (id) {
            const jobInfo = this.jobs.get(id);
            if (!jobInfo) {
                throw new Error(`Transfer job '${id}' not found`);
            }
            return this.jobToInfo(id, jobInfo.job);
        }

        return Array.from(this.jobs.entries()).map(([jobId, { job }]) =>
            this.jobToInfo(jobId, job)
        );
    }

    public cancelTransfer(id: string): void {
        const jobInfo = this.jobs.get(id);
        if (!jobInfo) {
            throw new Error(`Transfer job '${id}' not found`);
        }
        jobInfo.job.cancel();
    }

    public getActiveSourcesAndClients(): { sources: string[]; clients: string[] } {
        const sources = this.scrobbleSources.sources
            .filter(s => s.isReady())
            .map(s => s.name);

        const clients = this.scrobbleClients.clients
            .filter(c => c.isReady())
            .map(c => c.name);

        return { sources, clients };
    }

    private validateTransferOptions(options: TransferOptions): void {
        const { sourceName, clientName, playCount, fromDate, toDate } = options;

        if (!sourceName || sourceName.trim() === '') {
            throw new Error('Source name is required');
        }

        if (!clientName || clientName.trim() === '') {
            throw new Error('Client name is required');
        }

        if (!playCount && !fromDate && !toDate) {
            throw new Error('Either playCount or date range (fromDate/toDate) must be provided');
        }

        if (playCount !== undefined && playCount <= 0) {
            throw new Error('Play count must be greater than 0');
        }

        // Validate date range if provided
        if (fromDate || toDate) {
            const now = new Date();

            if (fromDate) {
                const from = new Date(fromDate);
                if (isNaN(from.getTime())) {
                    throw new Error('Invalid fromDate format');
                }
                if (from > now) {
                    throw new Error('fromDate cannot be in the future');
                }
            }

            if (toDate) {
                const to = new Date(toDate);
                if (isNaN(to.getTime())) {
                    throw new Error('Invalid toDate format');
                }
                if (to > now) {
                    throw new Error('toDate cannot be in the future');
                }
            }

            if (fromDate && toDate) {
                const from = new Date(fromDate);
                const to = new Date(toDate);
                if (from > to) {
                    throw new Error('fromDate must be before toDate');
                }
            }
        }

        const source = this.scrobbleSources.getByName(sourceName);
        if (!source) {
            throw new Error(`Source '${sourceName}' not found`);
        }

        if (!source.isReady()) {
            throw new Error(`Source '${sourceName}' is not ready`);
        }

        const client = this.scrobbleClients.getByName(clientName);
        if (!client) {
            throw new Error(`Client '${clientName}' not found`);
        }

        if (!client.isReady()) {
            throw new Error(`Client '${clientName}' is not ready`);
        }

        // Check if client supports time-range fetching (required for duplicate detection)
        if (!('getScrobblesForTimeRange' in client) || typeof (client as any).getScrobblesForTimeRange !== 'function') {
            throw new Error(`Client '${clientName}' does not support time-range fetching, which is required for accurate duplicate detection during transfers. Supported clients: Last.fm, Listenbrainz`);
        }

        if (playCount !== undefined && playCount > 10000) {
            this.logger.warn(`Play count ${playCount} is very large. This may take a long time.`);
        }
    }

    private jobToInfo(id: string, job: TransferJob): TransferJobInfo {
        const options: TransferOptions = {
            sourceName: job['sourceName'],
            clientName: job['clientName'],
        };

        if (job['playCount'] !== undefined) {
            options.playCount = job['playCount'];
        }
        if (job['fromDate'] !== undefined) {
            options.fromDate = job['fromDate'].format('YYYY-MM-DD');
        }
        if (job['toDate'] !== undefined) {
            options.toDate = job['toDate'].format('YYYY-MM-DD');
        }

        return {
            id,
            options,
            progress: job.getProgress(),
        };
    }

    private scheduleJobCleanup(id: string): void {
        setTimeout(() => {
            const jobInfo = this.jobs.get(id);
            if (jobInfo) {
                const progress = jobInfo.job.getProgress();
                if (progress.status === 'completed' || progress.status === 'failed') {
                    this.logger.debug(`Cleaning up transfer job data ${id}`);
                    this.jobs.delete(id);
                }
            }
        }, this.COMPLETED_JOB_TTL);
    }

    public destroy(): void {
        this.scheduler.stop();
        this.jobs.clear();
        this.logger.info('Transfer Manager destroyed');
    }
}
