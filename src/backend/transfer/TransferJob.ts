import { childLogger, Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";
import { hasPagelessTimeRangeListens, hasPaginagedListens, hasPaginatedTimeRangeListens, PaginatedSource, TRANSFORM_HOOK } from "../common/infrastructure/Atomic.js";
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

            if(this.playCount !== undefined) {
                await this.runPlayCountTransfer(source as unknown as PaginatedSource, client);
            } else {
                await this.runTimeRangeTransfer(source as unknown as PaginatedSource, client);
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
                const apiTotal = parseInt(pageInfo.total, 10);
                this.progress.total = this.playCount ? Math.min(this.playCount, apiTotal) : apiTotal;
                this.progress.totalPages = Math.ceil(this.progress.total / this.PAGE_SIZE);

                totalPagesKnown = true;
                this.logger.info(`Total plays in source: ${apiTotal}, Will transfer: ${this.progress.total}, Expected pages: ${this.progress.totalPages}`);
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

    private async runPlayCountTransfer(source: PaginatedSource, client: AbstractScrobbleClient): Promise<void> {

        let currentPage = 1; 
        let hasMorePages = true;
        let totalPages: number | undefined;
        let totalPagesKnown = false;
        let pageSize = this.PAGE_SIZE;

        let fromDate: number | undefined;
        let toDate: number | undefined;

         while(hasMorePages) {
            this.progress.currentPage = currentPage;

            const remaining = this.playCount - this.progress.processed;
            pageSize = Math.min(this.PAGE_SIZE, remaining);
            if (pageSize <= 0) {
                this.logger.info(`Reached play count limit of ${this.playCount}`);
                break;
            }


            let plays: PlayObject[] = [];

            if(hasPagelessTimeRangeListens(source)) {
                const resp = await source.getPagelessTimeRangeListens({
                    from: fromDate,
                    to: toDate,
                    limit: pageSize
                });
                if(resp.meta.total !== undefined) {
                    totalPages = resp.meta.total;
                }
                if(resp.data.length === 0) {
                    hasMorePages = false;
                }
                plays = [...resp.data];
                plays.sort(sortByOldestPlayDate);
                toDate = plays[0].data.playDate.unix() - 1;
            } else if(hasPaginagedListens(source)) {

                const resp = await source.getPaginatedListens({
                    page: currentPage,
                    limit: pageSize
                });
                if(resp.meta.total !== undefined) {
                    totalPages = resp.meta.total;
                }
                plays = [...resp.data];
                plays.sort(sortByOldestPlayDate);
            } else {
                throw new Error('Source does not support recent listens without a time range');
            }

            if(!totalPagesKnown && totalPages !== undefined) {
                this.progress.total = this.playCount ? Math.min(this.playCount, totalPages) : totalPages;
                this.progress.totalPages = Math.ceil(this.progress.total / this.PAGE_SIZE);

                totalPagesKnown = true;
                this.logger.info(`Total plays in source: ${totalPages}, Will transfer: ${this.progress.total}, Expected pages: ${this.progress.totalPages}`);
            }

            if(!hasMorePages) {
                break;
            }

            if (plays.length > 0) {
                await this.processPlaysWithSlidingWindow(plays, client);
            }

            if (this.playCount && this.progress.processed >= this.playCount) {
                this.logger.info(`Reached play count limit of ${this.playCount}`);
                hasMorePages = false;
            } else {
                currentPage++;
            }
         }
    }


    private async runTimeRangeTransfer(source: PaginatedSource, client: AbstractScrobbleClient): Promise<void> {

        let currentPage = 1; 
        let hasMorePages = true;
        let totalPages: number | undefined;
        let totalPagesKnown = false;
        let pageSize = this.PAGE_SIZE;

        let fromDate: number | undefined = this.fromDate.unix();
        let toDate: number | undefined = this.toDate.unix();

         while(hasMorePages) {
            this.progress.currentPage = currentPage;

            let plays: PlayObject[] = [];

            if(hasPagelessTimeRangeListens(source)) {
                const resp = await source.getPagelessTimeRangeListens({
                    from: fromDate,
                    to: toDate,
                    limit: pageSize
                });
                if(resp.meta.total !== undefined) {
                    totalPages = resp.meta.total;
                }
                if(resp.data.length === 0) {
                    hasMorePages = false;
                }
                plays = [...resp.data];
                plays.sort(sortByOldestPlayDate);
                fromDate = plays[plays.length - 1].data.playDate.unix() + 1;
            } else if(hasPaginatedTimeRangeListens(source)) {

                const resp = await source.getPaginatedTimeRangeListens({
                    page: currentPage,
                    from: fromDate,
                    to: toDate,
                    limit: pageSize
                });
                if(resp.meta.total !== undefined) {
                    totalPages = resp.meta.total;
                }
                plays = [...resp.data];
                plays.sort(sortByOldestPlayDate);
            } else {
                throw new Error('Source does not support time ranges');
            }

            if(!totalPagesKnown && totalPages !== undefined) {
                this.progress.total = this.playCount ? Math.min(this.playCount, totalPages) : totalPages;
                this.progress.totalPages = Math.ceil(this.progress.total / this.PAGE_SIZE);

                totalPagesKnown = true;
                this.logger.info(`Total plays in source: ${totalPages}, Will transfer: ${this.progress.total}, Expected pages: ${this.progress.totalPages}`);
            }

            if(!hasMorePages) {
                break;
            }

            if (plays.length > 0) {
                await this.processPlaysWithSlidingWindow(plays, client);
            }

            currentPage++;
         }
    }

    private timeRangeScrobbles: PlayObject[] = [];

    private async processPlaysWithSlidingWindow(plays: PlayObject[], client: AbstractScrobbleClient): Promise<void> {
        if (plays.length === 0) {
            return;
        }

        const oldest = plays[0].data.playDate;
        const newest = plays[plays.length - 1].data.playDate;

        // Fetch scrobbles for the specific time range being processed
        if (oldest && newest) {
            this.logger.debug(`Fetching client scrobbles for time range: ${oldest.format()} to ${newest.format()}`);

            // Check if client supports time-range fetching
            if ('getScrobblesForTimeRange' in client && typeof (client as any).getScrobblesForTimeRange === 'function') {
                try {
                    // Add a buffer before/after to catch nearby scrobbles
                    const bufferHours = 24;
                    const fromDate = oldest.subtract(bufferHours, 'hours');
                    const toDate = newest.add(bufferHours, 'hours');

                    this.timeRangeScrobbles = await (client as any).getScrobblesForTimeRange(fromDate, toDate, this.SLIDING_WINDOW_SIZE);
                    this.logger.debug(`Fetched ${this.timeRangeScrobbles.length} scrobbles from ${this.clientName} for duplicate detection`);
                } catch (e) {
                    this.logger.error(`Error fetching scrobbles for time range: ${e.message}`);
                    throw e;
                }
            } else {
                // Fallback to regular refresh (will only work for recent scrobbles)
                this.logger.warn('Client does not support time-range fetching, falling back to regular refresh (may not detect duplicates for old scrobbles)');
                await client.refreshScrobbles(this.SLIDING_WINDOW_SIZE);
                this.timeRangeScrobbles = [];
            }
        } else {
            await client.refreshScrobbles(this.SLIDING_WINDOW_SIZE);
            this.timeRangeScrobbles = [];
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

    private isAlreadyScrobbledInTimeRange(play: PlayObject): boolean {
        if (this.timeRangeScrobbles.length === 0) {
            return false;
        }

        const playDate = play.data.playDate;
        if (!playDate) {
            return false;
        }

        // Check for matching scrobble (same track, artist, and similar timestamp)
        return this.timeRangeScrobbles.some(scrobbled => {
            const scrobbledDate = scrobbled.data.playDate;
            if (!scrobbledDate) {
                return false;
            }

            // Check if timestamps are within 30 seconds of each other
            const timeDiffSeconds = Math.abs(playDate.diff(scrobbledDate, 'second'));
            if (timeDiffSeconds > 30) {
                return false;
            }

            // Check if track and artists match
            const trackMatch = play.data.track?.toLowerCase() === scrobbled.data.track?.toLowerCase();
            const artistsMatch = play.data.artists?.join(',').toLowerCase() === scrobbled.data.artists?.join(',').toLowerCase();

            return trackMatch && artistsMatch;
        });
    }

    private async processPlay(play: PlayObject, client: AbstractScrobbleClient): Promise<void> {
        const transformedPlay = client.transformPlay(play, TRANSFORM_HOOK.preCompare);

        // NOTE: We skip timeFrameIsValid check during transfers because:
        // 1. Transfers are for historical data that may be older than any existing scrobbles
        // 2. timeFrameIsValid is designed to prevent re-scrobbling during normal operation
        // 3. We have our own duplicate detection via time-range fetching

        // Check against our time-range-specific scrobbles (the actual duplicate detection)
        if (this.isAlreadyScrobbledInTimeRange(transformedPlay)) {
            this.logger.verbose(`DUPLICATE (time-range): ${buildTrackString(play)} - found in ${this.clientName}'s ${this.timeRangeScrobbles.length} scrobbles`);
            this.progress.duplicates++;
            return;
        }

        // Check using the client's built-in method (for recently added scrobbles from this transfer)
        const alreadyScrobbled = await client.alreadyScrobbled(transformedPlay);
        if (alreadyScrobbled) {
            this.logger.verbose(`DUPLICATE (recent): ${buildTrackString(play)} - found in ${this.clientName}'s recent scrobbles`);
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
