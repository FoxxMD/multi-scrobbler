import { childLogger, Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";
import { TRANSFORM_HOOK } from "../common/infrastructure/Atomic.js";
import LastfmApiClient from "../common/vendor/LastfmApiClient.js";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient.js";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.js";
import ScrobbleClients from "../scrobblers/ScrobbleClients.js";
import AbstractSource from "../sources/AbstractSource.js";
import LastfmSource from "../sources/LastfmSource.js";
import ListenbrainzSource from "../sources/ListenbrainzSource.js";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import { sortByOldestPlayDate } from "../utils.js";

export interface TransferOptions {
    sourceName: string;
    clientName: string;
    playCount?: number;
    fromDate?: string;
    toDate?: string;
}

export type TransferStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TransferProgress {
    status: TransferStatus;
    processed: number;
    total: number;
    queued: number;
    duplicates: number;
    errors: number;
    currentPage?: number;
    totalPages?: number;
    startedAt?: Dayjs;
    completedAt?: Dayjs;
    currentError?: string;
    currentTrack?: string;
    rate?: number;
}

export class TransferJob {
    private transferId: string;
    private sourceName: string;
    private clientName: string;
    private playCount?: number;
    private fromDate?: Dayjs;
    private toDate?: Dayjs;
    private logger: Logger;

    private progress: TransferProgress;
    private scrobbleSources: ScrobbleSources;
    private scrobbleClients: ScrobbleClients;
    private activeClient?: AbstractScrobbleClient;

    private shouldCancel: boolean = false;

    private readonly PAGE_SIZE = 200;
    private readonly SLIDING_WINDOW_SIZE = 500;
    private queuedCount: number = 0;

    constructor(
        options: TransferOptions,
        scrobbleSources: ScrobbleSources,
        scrobbleClients: ScrobbleClients,
        logger: Logger,
        transferId: string
    ) {
        this.transferId = transferId;
        this.sourceName = options.sourceName;
        this.clientName = options.clientName;
        this.playCount = options.playCount;
        this.scrobbleSources = scrobbleSources;
        this.scrobbleClients = scrobbleClients;
        this.logger = childLogger(logger, ['Transfer', `${this.sourceName} -> ${this.clientName}`, transferId]);

        if (options.fromDate) {
            this.fromDate = dayjs(options.fromDate);
        }
        if (options.toDate) {
            this.toDate = dayjs(options.toDate);
        }

        this.progress = {
            status: 'pending',
            processed: 0,
            total: options.playCount || 0,
            queued: 0,
            duplicates: 0,
            errors: 0,
        };
    }

    public getProgress(): TransferProgress {
        const progress = { ...this.progress };

        if (progress.startedAt && progress.processed > 0) {
            const elapsed = dayjs().diff(progress.startedAt, 'second');
            if (elapsed > 0) {
                progress.rate = progress.processed / elapsed;
            }
        }

        // Update queued count from our counter
        progress.queued = this.queuedCount;

        return progress;
    }

    public cancel(): void {
        this.shouldCancel = true;
        this.logger.info('Cancel requested');

        // Remove any queued items from the client's queue
        if (this.activeClient) {
            const transferSource = `transfer-${this.transferId}`;
            const removed = this.activeClient.cancelQueuedItemsBySource(transferSource);
            this.logger.info(`Removed ${removed} queued items from client queue`);
        }
    }

    public async run(): Promise<void> {
        this.progress.status = 'running';
        this.progress.startedAt = dayjs();

        const mode = this.fromDate || this.toDate ? 'date range' : 'recent plays';
        this.logger.info(`Starting transfer (${mode}) from ${this.sourceName} to ${this.clientName}`);

        try {
            const source = this.getSource();
            const client = this.getClient();
            this.activeClient = client; // Store for progress calculation

            if (!source.isReady()) {
                throw new Error(`Source '${this.sourceName}' is not ready`);
            }

            if (!client.isReady()) {
                throw new Error(`Client '${this.clientName}' is not ready`);
            }

            if (source instanceof LastfmSource) {
                await this.runLastfmTransfer(source as LastfmSource, client);
            } else if (source instanceof ListenbrainzSource) {
                await this.runListenbrainzTransfer(source as ListenbrainzSource, client);
            } else {
                await this.runGenericTransfer(source, client);
            }

            this.progress.status = 'completed';
            this.progress.completedAt = dayjs();
            this.logger.info(`Transfer completed: ${this.progress.queued} queued, ${this.progress.duplicates} duplicates, ${this.progress.errors} errors`);

        } catch (e) {
            this.progress.status = 'failed';
            this.progress.completedAt = dayjs();
            this.progress.currentError = e.message;
            this.logger.error(`Transfer failed: ${e.message}`);
            throw e;
        }
    }

    private async runLastfmTransfer(source: LastfmSource, client: AbstractScrobbleClient): Promise<void> {
        const api = source.api as LastfmApiClient;

        let currentPage = 1;
        let hasMorePages = true;
        let totalPagesKnown = false;

        while (hasMorePages) {
            this.logger.verbose(`Fetching page ${currentPage}...`);
            this.progress.currentPage = currentPage;

            // If playCount is specified, only fetch as many as we need
            let pageSize = this.PAGE_SIZE;
            if (this.playCount) {
                const remaining = this.playCount - this.progress.processed;
                pageSize = Math.min(this.PAGE_SIZE, remaining);
                if (pageSize <= 0) {
                    this.logger.info(`Reached play count limit of ${this.playCount}`);
                    break;
                }
            }

            const resp = await api.getRecentTracksWithPagination({
                page: currentPage,
                limit: pageSize,
                from: this.fromDate?.unix(),
                to: this.toDate?.unix(),
            });

            const {
                recenttracks: {
                    track: rawTracks = [],
                    '@attr': pageInfo
                }
            } = resp;

            if (pageInfo && !totalPagesKnown) {
                const totalPages = parseInt(pageInfo.totalPages, 10);
                const total = parseInt(pageInfo.total, 10);

                // If playCount is specified, cap the total at playCount
                if (this.playCount) {
                    this.progress.total = Math.min(this.playCount, total);
                    // Calculate how many pages we'll actually need
                    this.progress.totalPages = Math.ceil(this.progress.total / this.PAGE_SIZE);
                } else {
                    this.progress.total = total;
                    this.progress.totalPages = totalPages;
                }

                totalPagesKnown = true;
                this.logger.info(`Total pages in source: ${totalPages}, Total plays in source: ${total}, Will transfer: ${this.progress.total}, Expected pages: ${this.progress.totalPages}`);
            }

            if (rawTracks.length === 0) {
                hasMorePages = false;
                break;
            }

            const plays = rawTracks
                .filter(t => t.date !== undefined)
                .map(t => LastfmApiClient.formatPlayObj(t))
                .sort(sortByOldestPlayDate);

            if (plays.length > 0) {
                await this.processPlaysWithSlidingWindow(plays, client);
            }

            if (this.playCount && this.progress.processed >= this.playCount) {
                this.logger.info(`Reached play count limit of ${this.playCount}`);
                hasMorePages = false;
            } else {
                currentPage++;
                if (pageInfo && currentPage > parseInt(pageInfo.totalPages, 10)) {
                    hasMorePages = false;
                }
            }
        }
    }

    private async runListenbrainzTransfer(source: ListenbrainzSource, client: AbstractScrobbleClient): Promise<void> {
        const api = source.api as ListenbrainzApiClient;

        let maxTs = this.toDate?.unix();
        let hasMorePlays = true;
        let pageNum = 1;

        while (hasMorePlays) {
            this.logger.verbose(`Fetching page ${pageNum} (max_ts: ${maxTs})...`);
            this.progress.currentPage = pageNum;

            // If playCount is specified, only fetch as many as we need
            let pageSize = this.PAGE_SIZE;
            if (this.playCount) {
                const remaining = this.playCount - this.progress.processed;
                pageSize = Math.min(this.PAGE_SIZE, remaining);
                if (pageSize <= 0) {
                    this.logger.info(`Reached play count limit of ${this.playCount}`);
                    break;
                }
            }

            const resp = await api.getUserListensWithPagination({
                count: pageSize,
                minTs: this.fromDate?.unix(),
                maxTs,
            });

            const { listens = [] } = resp;

            if (listens.length === 0) {
                hasMorePlays = false;
                break;
            }

            const plays = listens
                .map(l => ListenbrainzApiClient.formatPlayObj(l, {}))
                .sort(sortByOldestPlayDate);

            if (plays.length > 0) {
                await this.processPlaysWithSlidingWindow(plays, client);

                const oldestPlay = plays[0];
                if (oldestPlay.data.playDate) {
                    maxTs = oldestPlay.data.playDate.unix() - 1;
                }
            }

            if (this.playCount && this.progress.processed >= this.playCount) {
                this.logger.info(`Reached play count limit of ${this.playCount}`);
                hasMorePlays = false;
            }

            pageNum++;
        }
    }

    private async runGenericTransfer(source: AbstractSource, client: AbstractScrobbleClient): Promise<void> {
        this.logger.verbose('Fetching plays from source...');
        const plays = await source.getRecentlyPlayed({ limit: this.playCount || 200 });

        if (plays.length === 0) {
            this.logger.warn('No plays returned from source');
            return;
        }

        this.logger.info(`Fetched ${plays.length} plays from source`);
        this.progress.total = plays.length;

        const sortedPlays = [...plays].sort(sortByOldestPlayDate);
        await this.processPlaysWithSlidingWindow(sortedPlays, client);
    }

    private async processPlaysWithSlidingWindow(plays: PlayObject[], client: AbstractScrobbleClient): Promise<void> {
        if (plays.length === 0) {
            return;
        }

        const oldest = plays[0].data.playDate;
        const newest = plays[plays.length - 1].data.playDate;

        if (oldest && newest) {
            this.logger.debug(`Refreshing client scrobbles for time range: ${oldest.format()} to ${newest.format()}`);
            await client.refreshScrobbles(this.SLIDING_WINDOW_SIZE);
        } else {
            await client.refreshScrobbles(this.SLIDING_WINDOW_SIZE);
        }

        for (let i = 0; i < plays.length; i++) {
            const play = plays[i];

            // Yield to event loop every 10 plays to keep UI responsive
            if (i > 0 && i % 10 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }

            if (this.shouldCancel) {
                this.progress.status = 'failed';
                this.progress.currentError = 'Transfer cancelled by user';
                throw new Error('Transfer cancelled by user');
            }

            this.progress.currentTrack = buildTrackString(play);

            try {
                await this.processPlay(play, client);
            } catch (e) {
                this.logger.error(`Error processing play ${buildTrackString(play)}: ${e.message}`);
                this.progress.errors++;
                this.progress.currentError = e.message;
            }

            this.progress.processed++;
        }

        this.progress.currentTrack = undefined;
    }

    private async processPlay(play: PlayObject, client: AbstractScrobbleClient): Promise<void> {
        const transformedPlay = client.transformPlay(play, TRANSFORM_HOOK.preCompare);

        // NOTE: We skip timeFrameIsValid check during transfers because:
        // 1. Transfers are for historical data that may be older than any existing scrobbles
        // 2. timeFrameIsValid is designed to prevent re-scrobbling during normal operation
        // 3. We have our own duplicate detection via time-range fetching

        const alreadyScrobbled = await client.alreadyScrobbled(transformedPlay);
        if (alreadyScrobbled) {
            this.logger.debug(`Skipping ${buildTrackString(play)}: already scrobbled`);
            this.progress.duplicates++;
            return;
        }

        // Queue the play for scrobbling - the client will process it asynchronously
        // and persist the queue to disk for crash recovery
        const scrobblePlay = client.transformPlay(transformedPlay, TRANSFORM_HOOK.postCompare);

        // Queue with our transfer ID as the source - queueScrobble will handle tracking
        client.queueScrobble(scrobblePlay, `transfer-${this.transferId}`);
        this.queuedCount++;

        this.logger.verbose(`Queued for scrobbling: ${buildTrackString(scrobblePlay)}`);
    }

    private getSource(): AbstractSource {
        const source = this.scrobbleSources.getByName(this.sourceName);
        if (!source) {
            throw new Error(`Source '${this.sourceName}' not found`);
        }
        return source;
    }

    private getClient(): AbstractScrobbleClient {
        const client = this.scrobbleClients.getByName(this.clientName);
        if (!client) {
            throw new Error(`Client '${this.clientName}' not found`);
        }
        return client;
    }
}
