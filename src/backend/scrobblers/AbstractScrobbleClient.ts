import { childLogger, Logger, LogLevel } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import { FixedSizeList } from 'fixed-size-list';
import { nanoid } from "nanoid";
import { MarkOptional, MarkRequired } from "ts-essentials";
import {
    DeadLetterScrobble,
    NowPlayingUpdateThreshold,
    PlayObject,
    PlayObjectLifecycleless,
    QueuedScrobble, ScrobbleActionResult, PlayMatchResult, SourcePlayerObj, TA_DURING,
    TA_FUZZY,
    TrackStringOptions,
    TA_EXACT,
    SOURCE_SOT,
    ErrorLike,
    CLIENT_INGRESS_QUEUE,
    CLIENT_DEAD_QUEUE
} from "../../core/Atomic.js";
import { artistNamesToCredits, buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.js";
import AbstractComponent from "../common/AbstractComponent.js";
import { hasUpstreamError } from "../common/errors/UpstreamError.js";
import {
    ARTIST_WEIGHT,
    Authenticatable,
    CALCULATED_PLAYER_STATUSES,
    DEFAULT_RETRY_MULTIPLIER,
    DUP_SCORE_THRESHOLD,
    FormatPlayObjectOptions,
    PaginatedTimeRangeOptions,
    REFRESH_STALE_DEFAULT,
    ScrobbledPlayObject,
    SourceIdentifier,
    TIME_WEIGHT,
    TimeRangeListensFetcher,
    TITLE_WEIGHT,
} from "../common/infrastructure/Atomic.js";
import { ClientType } from '../common/infrastructure/config/client/clients.js';
import { CommonClientConfig, NowPlayingOptions, UpstreamRefreshOptions } from "../common/infrastructure/config/client/index.js";
import { TRANSFORM_HOOK } from "../common/infrastructure/Transform.js";
import { Notifiers } from "../notifier/Notifiers.js";
import {
    comparingMultipleArtists,
    isDebugMode,
    parseBool,
    playObjDataMatch,
    pollingBackoff,
    removeUndefinedKeys,
    sleep,
    sortByOldestPlayDate,
} from "../utils.js";
import { findCauseByReference, messageWithCauses, messageWithCausesTruncatedDefault } from "../utils/ErrorUtils.js";
import {
    comparePlayTemporally,
    getTemporalAccuracyCloseVal,
    hasAcceptableTemporalAccuracy,
    temporalAccuracyToString,
    temporalPlayComparisonSummary,
} from "../utils/TimeUtils.js";
import { todayAwareFormat } from "../../core/TimeUtils.js";
import { WebhookPayload } from "../common/infrastructure/config/health/webhooks.js";
import { AsyncTask, SimpleIntervalJob, Task, ToadScheduler } from "toad-scheduler";
import { getRoot } from "../ioc.js";
import { rehydratePlay } from "../utils/CacheUtils.js";
import { findAsyncSequential, staggerMapper, StaggerOptions } from "../utils/AsyncUtils.js";
import pMap, { pMapIterable } from "p-map";
import { comparePlayArtistsNormalized, comparePlayTracksNormalized, existingScrobble, ExistingScrobbleOpts } from "../utils/PlayComparisonUtils.js";
import { lifecyclelessInvariantTransform } from "../../core/PlayUtils.js";
import { normalizeStr } from "../utils/StringUtils.js";
import prom, { Counter, Gauge } from 'prom-client';
import { generateLoggableAbortReason, ScrobbleSubmitError, SimpleError } from "../common/errors/MSErrors.js";
import {isErrorLike, serializeError} from 'serialize-error';
import { DEFAULT_NEW_PADDING, groupPlaysToTimeRanges } from "../utils/ListenFetchUtils.js";
import { spawn, catchAbortError, isAbortError, rethrowAbortError, delay, forever, AbortError, throwIfAborted } from 'abort-controller-x';
import { DrizzlePlayRepository, playToRepositoryCreatePlayOpts, QueryPlaysOpts } from "../common/database/drizzle/repositories/PlayRepository.js";
import { PlaySelect, PlaySelectWithQueueStates, QueueStateNew, QueueStateSelect } from "../common/database/drizzle/drizzleTypes.js";
import { asPlay } from "../../core/PlayMarshalUtils.js";
import { DrizzleQueueRepository } from "../common/database/drizzle/repositories/QueueRepository.js";
import { SourceType } from "../common/infrastructure/config/source/sources.js";

type PlatformMappedPlays = Map<string, {player: SourcePlayerObj, source: SourceIdentifier}>;
type NowPlayingQueue = Map<string, PlatformMappedPlays>;

const platformTruncate = truncateStringToLength(10);


export default abstract class AbstractScrobbleClient extends AbstractComponent implements Authenticatable {

    name: string;
    declare type: ClientType;

    scheduler: ToadScheduler = new ToadScheduler();
    protected initDeadTimeout: NodeJS.Timeout | undefined;

    protected MAX_STORED_SCROBBLES = 40;
    protected MAX_INITIAL_SCROBBLES_FETCH = this.MAX_STORED_SCROBBLES;

    scrobbleSOTRanges: PaginatedTimeRangeOptions[] = [];
    tracksScrobbled: number = 0;

    lastScrobbleAttempt: Dayjs = dayjs(0)
    upstreamRefresh: MarkOptional<Required<UpstreamRefreshOptions>, 'refreshInitialCount'>;
    checkExistingScrobbles: boolean;
    verboseOptions;

    scrobbleDelay: number = 1000;
    scrobbleSleep: number = 2000;
    scrobbleWaitStopInterval: number = 2000;
    protected scrobbleQueueAbortController: AbortController | undefined;
    protected scrobbleQueuePromise: Promise<void> | undefined;
    protected deadQueueAbortController: AbortController | undefined;
    protected deadQueuePromise: Promise<void> | undefined;
    scrobbleRetries: number =  0;
    scrobbling: boolean = false;
    deadQueueProcessing: boolean = false;
    queuedLength: number = 0;
    deadLetterLength: number = 0;
    deadLetterQueued: number  = 0;

    supportsNowPlaying: boolean = false;
    nowPlayingInit: boolean = false;
    nowPlayingEnabled: boolean;
    nowPlayingFilter: (queue: NowPlayingQueue) => SourcePlayerObj | undefined;
    nowPlayingMinThreshold: NowPlayingUpdateThreshold = (_) => 10;
    nowPlayingMaxThreshold: NowPlayingUpdateThreshold = (_) => 30;
    nowPlayingLastUpdated?: Dayjs;
    nowPlayingLastPlay?: SourcePlayerObj;
    nowPlayingQueue: NowPlayingQueue = new Map();
    nowPlayingTaskInterval: number = 5000;
    npLogger: Logger;
    dupeLogger: Logger;
    deadLogger: Logger;

    existingScrobble: (playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean) => Promise<PlayMatchResult>

    declare config: CommonClientConfig;

    notifier: Notifiers;
    emitter: EventEmitter;

    protected scrobbledCounter: Counter;
    protected queuedGauge: Gauge;
    protected deadLetterGauge: Gauge;
    protected problemGauge: Gauge;

    protected staggerOpts: Partial<StaggerOptions>;
    protected staggerMappers = {
        preCompare: staggerMapper<PlayObject, PlayObject>({concurrency: 2}),
        existing: staggerMapper<PlayObject, PlayObject>({concurrency: 2})
    }

    declare protected componentType: 'client';

    protected playRepo!: DrizzlePlayRepository;
    protected queueRepo!: DrizzleQueueRepository;

    constructor(type: any, name: any, config: CommonClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super(config);
        this.componentType = 'client';
        this.type = type;
        this.name = name;
        this.logger = childLogger(logger, this.getIdentifier());
        this.npLogger = childLogger(this.logger, 'Now Playing');
        this.dupeLogger = childLogger(this.logger, 'Dupe');
        this.deadLogger = childLogger(this.logger, CLIENT_DEAD_QUEUE);
        this.notifier = notifier;
        this.emitter = emitter;

        const {
            options: {
                refreshEnabled = true,
                refreshInitialCount,
                refreshMinInterval = 5,
                refreshStaleAfter = REFRESH_STALE_DEFAULT,
                checkExistingScrobbles = true,
                verbose = {},
            } = {},
        } = this.config
        this.upstreamRefresh = {
            refreshEnabled,
            refreshInitialCount,
            refreshMinInterval,
            refreshStaleAfter
        };
        if(refreshStaleAfter < (refreshMinInterval/1000)) {
            this.logger.warn(`refreshMinInterval (${refreshMinInterval}ms) is longer than refreshStaleAfter (${refreshStaleAfter}s)! This would cause refreshStaleAfter to potentially not trigger a refresh. Setting refreshMinInterval to same interval as refreshStaleAfter`);
            this.upstreamRefresh.refreshMinInterval = refreshStaleAfter * 1000;
        }
        this.checkExistingScrobbles = checkExistingScrobbles;

        const {
            match: {
                onNoMatch = isDebugMode(),
                onMatch = isDebugMode(),
                confidenceBreakdown = isDebugMode(),
            } = {},
            ...vRest
        } = verbose
        if (onMatch || onNoMatch || isDebugMode()) {
            this.logger.warn('Setting verbose matching may produce noisy logs! Use with care.');
        }
        this.verboseOptions = {
            ...vRest,
            match: {
                onNoMatch,
                onMatch,
                confidenceBreakdown
            }
        };

        const clientMetrics = getRoot().items.clientMetrics;
        this.queuedGauge = clientMetrics.queued;
        this.deadLetterGauge = clientMetrics.deadLetter;
        this.scrobbledCounter = clientMetrics.scrobbled;
        const existingScrobbleOpts: ExistingScrobbleOpts = {
            logger: this.dupeLogger,
            transformRules: this.transformRules,
            transformPlay: this.transformPlay,
            existingSubmitted: this.findExistingSubmittedPlayObj
        }
        this.existingScrobble = (playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean) => existingScrobble(playObjPre, existingScrobbles, existingScrobbleOpts, log);
    }

    [Symbol.dispose]() {
        this.scheduler.stop();
        for(const job of this.scheduler.getAllJobs()) {
            this.scheduler.removeById(job.id);
        }
        
    }
    async [Symbol.asyncDispose]() {
        this[Symbol.dispose]();
        await this.tryStopScrobbling();
    }

    public initTasks(opts: {deadDelay?: number} = {}) {
        if(this.scheduler.existsById('heartbeat') === false) {
            this.logger.info('Adding Heartbeat Task and running immediately');
            this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
                minutes: 20,
                runImmediately: true
            }, new AsyncTask(
                'Heartbeat',
                (): Promise<any> => {
                    return this.heartbeatTask().then(() => null).catch((err) => {
                        this.logger.error(err);
                    });
                },
                (err: Error) => {
                    this.logger.error(err);
                }
            ), {id: 'heartbeat'}));
        } else {
            this.logger.warn('Heartbeat task is already added to scheduler.');
        }

        this.initializeNowPlayingSchedule();

        if(this.scheduler.existsById('dead') === false && this.initDeadTimeout === undefined) {
            const deadDelay = opts.deadDelay ?? 120;
            this.logger.verbose(`Delaying Dead Scrobbler Processing Task by ${deadDelay} seconds`);
            this.initDeadTimeout = setTimeout(() => {
                this.logger.info('Adding Dead Scrobbler Processing Task and running immediately');
                this.initDeadTimeout = undefined;
                this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({
                    minutes: 20,
                    runImmediately: true
                }, new AsyncTask(
                    'Dead',
                    (): Promise<any> => {
                        if(this.isReady()) {
                            return this.processDeadLetterQueue().then(() => null).catch((e) => {
                                this.logger.error(e);
                            })
                        }
                        return new Promise((resolve, reject) => resolve);
                    },
                    (err: Error) => {
                        this.logger.error(err);
                    }
                ), {id: 'dead'}));
            }, deadDelay * 1000);

        } else {
            if(this.initDeadTimeout !== undefined) {
                this.logger.warn('Dead scrobble task timeout is already set');
            } else {
                this.logger.warn('Dead scrobble task is already added to the scheduler');
            }
        }
    }

    protected async heartbeatTask(): Promise<boolean> {
        if(!this.isReady()) {
            if(!this.canAuthUnattended()) {
                this.logger.warn({labels: 'Heartbeat'}, 'Client is not ready but will not try to initialize because auth state is not good and cannot be corrected unattended.')
                return false;
            }
            try {
                await this.tryInitialize({force: false, notify: true, notifyTitle: 'Could not initialize automatically'});
            } catch (e) {
                this.logger.error(new Error('Could not initialize automatically', {cause: e}));
                return false;
            }

            if(!this.canAuthUnattended()) {
                this.logger.warn({label: 'Heartbeat'}, 'Should be monitoring scrobbles but will not attempt to start because auth state is not good and cannot be correct unattended.');
                return false;
            }

            //await client.processDeadLetterQueue();
            if(!this.scrobbling) {
                this.logger.info({labels: 'Heartbeat'}, 'Should be processing scrobbles! Attempting to restart scrobbling...');
                this.initScrobbleMonitoring().catch((e) => this.logger.error('Failed to initialize scrobbler monitoring during heartbeat'));
                return true;
            }
        }
        return true;
    }

    protected async postCache(): Promise<void> {
        await super.postCache();
        this.generateStaggerMappers();
    }

    protected async postDatabase(): Promise<void> {
        this.playRepo = new DrizzlePlayRepository(this.db, {logger: this.logger});
        this.queueRepo = new DrizzleQueueRepository(this.db, {logger: this.logger});
        this.playRepo.componentId = this.dbComponent.id;
        this.queueRepo.componentId = this.dbComponent.id;
        this.tracksScrobbled = this.dbComponent.countLive + this.dbComponent.countNonLive;
        await this.updateQueueStats([CLIENT_INGRESS_QUEUE, CLIENT_DEAD_QUEUE]);
    }

    protected async updateQueueStats(queueNames: string[]) {
        if(queueNames.includes(CLIENT_INGRESS_QUEUE)) {
            this.queuedLength = await this.queueRepo.getQueueCount(this.dbComponent.id, [CLIENT_INGRESS_QUEUE]);
            this.queuedGauge.labels(this.getPrometheusLabels()).set(this.queuedLength);
        }
        if(queueNames.includes(CLIENT_DEAD_QUEUE)) {
            this.deadLetterLength = await this.queueRepo.getQueueCount(this.dbComponent.id, [CLIENT_DEAD_QUEUE], ['queued', 'failed']);
            this.deadLetterQueued = await this.queueRepo.getQueueCount(this.dbComponent.id, [CLIENT_DEAD_QUEUE], ['queued']);
            // TODO
            this.deadLetterGauge.labels(this.getPrometheusLabels()).set(this.deadLetterLength);
        }
    }

    protected generateStaggerMappers() {
        const {
            preCompare = [],
            compare: {
                existing = []
            } = {}
        } = this.transformRules;

        if(preCompare.length > 0) {
            let pcInits: number[] = [0],
            pcMaxStagger: number[] = [];
            for(const hook of preCompare) {
                const t = this.transformManager.getTransformerByStage({type: hook.type, name: hook.name});
                pcInits.push(t.staggerOpts?.initialInterval ?? 0);
                pcMaxStagger.push(t.staggerOpts?.maxRandomStagger ?? 0)
            }
            this.staggerMappers.preCompare = staggerMapper<PlayObject, PlayObject>({initialInterval: Math.max(...pcInits), maxRandomStagger: Math.max(...pcMaxStagger), concurrency: 3});
        }

        if(existing.length > 0) {
            let eInits: number[] = [0],
            eMaxStagger: number[] = [];
            for(const hook of existing) {
                const t = this.transformManager.getTransformerByStage({type: hook.type, name: hook.name});
                eInits.push(t.staggerOpts?.initialInterval ?? 0);
                eMaxStagger.push(t.staggerOpts?.maxRandomStagger ?? 0)
            }
            this.staggerMappers.existing = staggerMapper<PlayObject, PlayObject>({initialInterval: Math.max(...eInits), maxRandomStagger: Math.max(...eMaxStagger), concurrency: 3});
        }
    }

    protected getIdentifier() {
        return `${capitalize(this.type)} - ${this.name}`
    }
    protected getMachineId() {
        return `${this.type}-${this.name}`;
    }
    public getSafeExternalName() {
        return normalizeStr(this.name, {keepSingleWhitespace: false});
    }
    public getSafeExternalId() {
        return `${this.type}-${normalizeStr(this.name, {keepSingleWhitespace: false})}`;
    }

    protected getPrometheusLabels() {
        return {name: this.getSafeExternalName(), type: this.type};
    }

    public notify = async (payload: WebhookPayload) => {
        this.emitEvent('notify', payload);
    }

    public nowPlayingSourceAllowed(source: string) {
        if(!this.supportsNowPlaying || !this.nowPlayingEnabled) {
            return false;
        }
        const {
            options = {},
        } = this.config;
        if('nowPlaying' in options && Array.isArray(options.nowPlaying)) {
            return options.nowPlaying.map(x => x.toLocaleLowerCase()).includes(source.toLocaleLowerCase());
        }
        return true;
    }

    protected initializeNowPlaying() {

        if (this.supportsNowPlaying) {

            const {
                options = {},
            } = this.config;

            // for future use...if we let user manually toggle now playing off/on
            if(this.nowPlayingEnabled === undefined) {
                const npEnv = process.env.NOW_PLAYING;
                if('nowPlaying' in options) {
                    const nowOpts = options as NowPlayingOptions;
                    this.nowPlayingEnabled = nowOpts.nowPlaying === true || Array.isArray(nowOpts.nowPlaying);
                    this.npLogger.debug(`${this.nowPlayingEnabled ? 'Enabled' : 'Disabled'} by 'nowPlaying' config`);
                } else if (npEnv !== undefined) {
                    this.nowPlayingEnabled = parseBool(npEnv);
                    this.npLogger.debug(`${this.nowPlayingEnabled ? 'Enabled' : 'Disabled'} by global ENV`);
                } else {
                    this.nowPlayingEnabled = true;
                    this.npLogger.debug(`Enabled by default config`);
                }
            }

            this.initializeNowPlayingFilter();
            this.nowPlayingInit = true;
        } else {
            this.npLogger.debug('Unsupported feature, disabled.');
        }
    }

    protected initializeNowPlayingSchedule() {

        if(this.scheduler.existsById('pn_task') === false) {
            const t = new AsyncTask('Playing Now', (): Promise<any> => {
                return this.processingPlayingNow();
            }, (err: Error) => {
                this.npLogger.error(new Error('Unexpected error while processing Now Playing queue', {cause: err}));
            });

            // even though we are processing every 5 seconds the interval that Now Playing is updated at, and that the queue is cleared on,
            // is still set by shouldUpdatePlayingNow()
            // 5 seconds makes sure our granularity for updates is decently fast *when* we do need to actually update
            this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({milliseconds: this.nowPlayingTaskInterval}, t, {id: 'pn_task'}));
        }
    }

    protected initializeNowPlayingFilter() {

        const {
            options = {},
        } = this.config;

        if (this.supportsNowPlaying) {

            let sourceFilter: (queue: NowPlayingQueue) => PlatformMappedPlays | undefined;

            // sources default to being filters by name-type, alphabetically
            sourceFilter = (queue: NowPlayingQueue) => {
                const sorted = Array.from(queue.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                return sorted[0][1];
            }

            if ('nowPlaying' in options) {
                const nowOpts = options as NowPlayingOptions;
                if (this.nowPlayingEnabled === undefined) {
                    this.nowPlayingEnabled = nowOpts.nowPlaying === true || Array.isArray(nowOpts.nowPlaying);
                }
                if (Array.isArray(nowOpts.nowPlaying)) {
                    // if user defined priority list of source names then we use that instead, look for source name in name-type
                    sourceFilter = (queue: NowPlayingQueue) => {
                        const entries = Array.from(queue.entries());
                        for (const s of nowOpts.nowPlaying as string[]) {
                            const sLower = s.toLocaleLowerCase();
                            const validSource = entries.find(x => x[0].toLocaleLowerCase().includes(sLower));
                            if (validSource !== undefined) {
                                return validSource[1];
                            }
                        }
                        return undefined;
                    }
                }
            }

            this.nowPlayingFilter = (queue: NowPlayingQueue): SourcePlayerObj => {
                if (queue.size === 0) {
                    return undefined;
                }

                // get list of play(ers) for top-priority Source
                const platformPlays = sourceFilter(queue);
                if (platformPlays === undefined) {
                    return undefined;
                }
                // if only one player then return it
                const plays = Array.from(platformPlays);
                if (plays.length === 1) {
                    return plays[0][1].player;
                }
                // else we need to sort players to determine which to report

                // if a now playing play already exists use that platform, if any matches...
                // this way we aren't flip-flopping between multiple players for reporting now playing
                // (keeps reporting sticky based on first reported)
                if (this.nowPlayingLastPlay !== undefined) {

                    for (const [platform, data] of plays) {
                        if (platform === this.nowPlayingLastPlay.platformId
                            // only keep using sticky platform if it hasn't gone stale/orphaned
                            && (!(data.player.status?.stale ?? false) && !(data.player.status?.orphaned ?? false))) {
                            return data.player;
                        }
                    }
                }

                // prefer players that are not stale/orphaned
                let preferredPlays: typeof plays = plays.filter(([platform, data]) => !(data.player.status?.stale ?? false) && !(data.player.status?.orphaned ?? false));
                if(preferredPlays.length === 0) {
                    // but if there are none of these then just use whatever players are on-hand
                    preferredPlays = plays;
                }

                // otherwise sort platform alphabetically and take first
                plays.sort((a, b) => a[0].localeCompare(b[0]));
                return plays[0][1].player;
            }
        }
    }

    protected async doParseCache(): Promise<true | string | undefined> {
        const cachedQueue = (await this.cache.cacheScrobble.get(`${this.getMachineId()}-queue`) as QueuedScrobble<PlayObject>[] ?? []);
        if (cachedQueue.length > 0) {
            this.logger.info('Migrating cached scrobbles to database...');
            let allGood = true;
            for (const cachedQueuedScrobble of cachedQueue) {
                const play = asPlay(cachedQueuedScrobble.play);
                const {
                    meta: {
                        lifecycle,
                        ...metaRest
                    },
                } = play;
                try {
                    const res = await this.playRepo.createPlays([
                        playToRepositoryCreatePlayOpts({
                            play: {
                                ...play,
                                data: {
                                    ...play.data,
                                    artists: play.data?.artists === undefined ? undefined : artistNamesToCredits(play.data?.artists as unknown as string[]),
                                    albumArtists: play.data?.albumArtists === undefined ? undefined : artistNamesToCredits(play.data?.albumArtists as unknown as string[])
                                },
                                meta: {
                                    ...metaRest,
                                    lifecycle: {
                                        steps: []
                                    }
                                }
                            },
                            componentId: this.dbComponent.id,
                            state: 'queued',
                            parentId: play.id
                        })
                    ]);
                    this.logger.verbose(`Migrated Play ${res[0].uid} => ${buildTrackString(play)}`);
                } catch (e) {
                    allGood = false;
                    this.logger.verbose(new Error(`Failed to migrate Play ${buildTrackString(play)}`, {cause: e}));
                }
            }
            this.logger[allGood ? 'info' : 'warn'](allGood ? 'Finished migrating all queued scrobbles.' : 'Migrated queued scrobbles with errors');
            await this.cache.cacheScrobble.delete(`${this.getMachineId()}-queue`);
            this.logger.info('Deleted legacy cached queued scrobbles');
        }

        const cachedDead = (await this.cache.cacheScrobble.get(`${this.getMachineId()}-dead`) as DeadLetterScrobble<PlayObject>[] ?? []);
        if(cachedDead.length > 0) {
            this.logger.info('Migrating failed scrobbles to database...');
            let allGood = true;
            for(const cDeadScrobble of cachedDead) {
                const play = asPlay(cDeadScrobble.play);
                const {
                    meta: {
                        lifecycle,
                        ...metaRest
                    },
                } = play;
                try {
                    const res = await this.playRepo.createPlays([
                        playToRepositoryCreatePlayOpts({
                            play: {
                                ...play,
                                data: {
                                    ...play.data,
                                    artists: play.data?.artists === undefined ? undefined : artistNamesToCredits(play.data?.artists as unknown as string[]),
                                    albumArtists: play.data?.albumArtists === undefined ? undefined : artistNamesToCredits(play.data?.albumArtists as unknown as string[])
                                },
                                meta: {
                                    ...metaRest,
                                    lifecycle: {
                                        steps: []
                                    }
                                }
                            },
                            componentId: this.dbComponent.id,
                            state: 'failed',
                            parentId: play.id
                        })
                    ]);
                    this.logger.verbose(`Added Play ${res[0].uid} to database => ${buildTrackString(play)}`);
                    await this.queueRepo.create({
                        componentId: this.dbComponent.id,
                        playId: res[0].id,
                        queueName: CLIENT_DEAD_QUEUE,
                        queueStatus: 'queued',
                        retries: cDeadScrobble.retries,
                        error: cDeadScrobble.error !== undefined ? {message: cDeadScrobble.error } : undefined
                    });
                    this.logger.verbose(`Added Play ${res[0].uid} to Failed Queue`);
                } catch (e) {
                    allGood = false;
                    this.logger.verbose(new Error(`Failed to migrate Play to failed queued ${buildTrackString(play)}`, {cause: e}));
                }
                this.logger[allGood ? 'info' : 'warn'](allGood ? 'Finished migrating all failed scrobbles.' : 'Migrated failed scrobbles with errors');
                await this.cache.cacheScrobble.delete(`${this.getMachineId()}-dead`);
                this.logger.info('Deleted legacy cached failed scrobbles');
            }
        }

        return;
    }

    protected async postInitialize(): Promise<void> {
        const {
            options: {
                refreshInitialCount = this.MAX_INITIAL_SCROBBLES_FETCH
            } = {},
            options = {},
        } = this.config;

        this.initializeNowPlaying();

        let initialLimit = refreshInitialCount;
        if (refreshInitialCount > this.MAX_INITIAL_SCROBBLES_FETCH) {
            this.logger.warn(`Defined initial scrobbles count (${refreshInitialCount}) higher than maximum allowed (${this.MAX_INITIAL_SCROBBLES_FETCH}). Will use max instead.`);
            initialLimit = this.MAX_INITIAL_SCROBBLES_FETCH;
        }

        this.logger.verbose(`Preloading up to ${initialLimit} initial scrobbles...`);

        try  {
            const preload = await this.getScrobblesForTimeRange({
                limit: initialLimit,
                fetchMax: initialLimit
            });
            if(preload === undefined) {
                this.logger.warn('Preload result was undefined!');
            } else {
                if(preload.length === 0) {
                    this.logger.verbose(`Preloaded 0 scrobbles.`);
                } else {
                    preload.sort(sortByOldestPlayDate);
                    const from = preload[0].data.playDate;
                    // we are assuming that all fetchers return latest scrobbles first (pretty sure this is the case)
                    const to = dayjs();// preload[preload.length - 1].data.playDate;
                    await this.cache.cacheClientScrobbles.set<PlayObject[]>(this.getScrobbleCacheKey(from, to), preload, '60s');
                    this.scrobbleSOTRanges.push({from: from.unix(), to: to.unix()});
                    this.logger.verbose(`Preloaded ${preload.length} scrobbles from ${todayAwareFormat(from)} to ${todayAwareFormat(to)}`);
                }
            }
        } catch (e) {
            this.logger.warn(new SimpleError('Could not preload scrobbles', {cause: e, shortStack: true}));
        }
    }

    abstract getScrobblesForTimeRange: TimeRangeListensFetcher;

    protected getScrobbleCacheKey = (from: Dayjs | number, to: Dayjs | number): string => {
        return `${this.name}-scrobbleRange-${typeof from === 'number' ? from : from.unix()}-${typeof to === 'number' ? to :to.unix()}`;
    }

    handleQueuedScrobbleRanges = async (deadRetries: number = 3) => {
            const queued = await this.playRepo.getQueuedScrobbleRange(CLIENT_INGRESS_QUEUE);
            const dead = await this.playRepo.getQueuedScrobbleRange(CLIENT_DEAD_QUEUE, {retries: deadRetries});
            this.scrobbleSOTRanges = groupPlaysToTimeRanges(queued.concat(dead), this.scrobbleSOTRanges, {staleNowBuffer: this.config.options?.refreshStaleAfter});
    }

    getSOTScrobblesForPlay = async (play: PlayObject): Promise<PlayObject[]> => {
        let range: PaginatedTimeRangeOptions = this.scrobbleSOTRanges.find(x => x.from <= play.data.playDate.unix() && x.to > Math.min(dayjs().subtract(this.config.options?.refreshStaleAfter ?? REFRESH_STALE_DEFAULT, 's').unix(), play.data.playDate.unix()));
        if(range === undefined) {
            this.logger.warn(`No Scrobble SOT range found! Should have been handled before this. Creating a new one for ${buildTrackString(play)}`);
            range = {
                from: play.data.playDate.subtract(DEFAULT_NEW_PADDING).unix(), 
                to: Math.min(play.data.playDate.add(DEFAULT_NEW_PADDING).unix(), dayjs().subtract(this.config.options?.refreshStaleAfter ?? REFRESH_STALE_DEFAULT, 's').unix()) 
            };
            this.scrobbleSOTRanges.push(range);
        }
        const cachedPlaysRes = await this.cache.cacheClientScrobbles.get<PlayObject[] | Error>(this.getScrobbleCacheKey(range.from, range.to));
        if(cachedPlaysRes instanceof Error) {
            throw new SimpleError('Cannot get historical plays due to cached error', {cause: cachedPlaysRes, shortStack: true});
        }
        if(cachedPlaysRes !== undefined) {
            return cachedPlaysRes;
        }
        try {
            const plays = await this.getScrobblesForTimeRange(range);
            plays.sort(sortByOldestPlayDate);
            await this.cache.cacheClientScrobbles.set<PlayObject[] | Error>(this.getScrobbleCacheKey(range.from, range.to), plays, (this.config.options?.refreshStaleAfter ?? REFRESH_STALE_DEFAULT) * 1000);
            return plays;
        } catch (e) {
            await this.cache.cacheClientScrobbles.set<PlayObject[] | Error>(this.getScrobbleCacheKey(range.from, range.to), e, '10s');
            throw new SimpleError('Cannot get historical plays', {cause: e, shortStack: true});
        }
    }
    public async alreadyScrobbled(playObj: PlayObject, log?: boolean): Promise<[boolean, PlayMatchResult]> {
        const result = await this.existingScrobble(playObj, await this.getSOTScrobblesForPlay(playObj));
        return [result.match, result];
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => {
        this.logger.warn('formatPlayObj should be defined by concrete class!');
        return obj;
    }

    addScrobbledTrack = async (playObj: PlayObject) => {
        this.emitEvent('scrobble', { play: playObj });
        try {
            await this.componentRepo.updateById(this.dbComponent.id, {countLive: this.dbComponent.countLive + 1});
        } catch (e) {
            this.logger.warn(new Error('Unable to update scrobble count', {cause: e}));
        }
        //this.scrobbledPlayObjs.add({play: playObj, scrobble: scrobbledPlay});
        this.scrobbledCounter.labels(this.getPrometheusLabels()).inc();
        //this.lastScrobbledPlayDate = playObj.data.playDate;
        this.tracksScrobbled++;
    }

    findExistingSubmittedPlayObj = async (playObjPre: PlayObject): Promise<([undefined, undefined] | [ScrobbledPlayObject, ScrobbledPlayObject[]])> => {

        const playObj = await this.transformPlay(playObjPre, TRANSFORM_HOOK.candidate);

        if(this.transformRules.compare?.existing === undefined) {
            // if no existing transform then we can run cheap db match
            const cheapExisting = await this.playRepo.checkExisting(playObj, {states: ['scrobbled']});
            if(cheapExisting !== undefined) {
                const s: ScrobbledPlayObject = {play: cheapExisting.play, scrobble: cheapExisting.play.meta.lifecycle?.scrobble?.mergedScrobble};
                return [s, [s]];
            }
        }

        const closeTemporalPlays = await this.playRepo.getTemporallyClosePlays(playObj, {states: ['scrobbled']});

        const dtInvariantMatches = (await pMap(closeTemporalPlays.map(x => x.play), this.staggerMappers.existing(async x => (await this.transformPlay(x, TRANSFORM_HOOK.existing))), {concurrency: 3}))
            .filter(x => playObjDataMatch(playObj, x));

        if (dtInvariantMatches.length === 0) {
            return [undefined, []];
        }

        const matchPlayDate = dtInvariantMatches.find((x: PlayObject) => {
            const temporalComparison = comparePlayTemporally(x, playObj);
            return hasAcceptableTemporalAccuracy(temporalComparison.match)
        });

        const s: ScrobbledPlayObject = {play: matchPlayDate, scrobble: matchPlayDate.meta.lifecycle?.scrobble?.mergedScrobble};

        return [s, [s]];
    }

    public scrobble = async (playObj: PlayObject, opts?: { delay?: number | false, signal?: AbortSignal }): Promise<PlayObject> => {
        const {delay: delayDuration, signal} = opts || {};
        const scrobbleDelay = delayDuration === undefined ? this.scrobbleDelay : (delayDuration === false ? 0 : delayDuration);
        if (scrobbleDelay !== 0) {
            const lastScrobbleDiff = dayjs().diff(this.lastScrobbleAttempt, 'ms');
            const remainingDelay = scrobbleDelay - lastScrobbleDiff;
            if (remainingDelay > 0) {
                this.logger.debug(`Waiting ${remainingDelay}ms to scrobble so time passed since previous scrobble is at least ${scrobbleDelay}ms`);
                if(signal !== undefined) {
                    await delay(signal, scrobbleDelay);
                } else {
                    await sleep(scrobbleDelay);
                }
                
            }
        }
        try {
            const result = await this.doScrobble(playObj);
            const {
                scrobble = {},
            } = playObj.meta.lifecycle;
            playObj.meta.lifecycle.scrobble = {
                ...scrobble,
                payload: result.payload,
                warnings: result.warnings,
                response: result.response,
                mergedScrobble: result.mergedScrobble !== undefined ? lifecyclelessInvariantTransform(result.mergedScrobble) : undefined
            }
            return playObj;
        } finally {
            this.lastScrobbleAttempt = dayjs();
        }
    }

    protected abstract doScrobble(playObj: PlayObject): Promise<ScrobbleActionResult & {play?: PlayObject}>

    public abstract playToClientPayload(playObject: PlayObject): object

    initScrobbleMonitoring = async (options: {force?: boolean, notify?: boolean} = {}) => {
        const {force = false, notify = false} = options;

        if(!this.isReady() || force) {
            try {
                await this.tryInitialize(options);
            } catch (e) {
                this.logger.error(new Error('Cannot start monitoring because Client is not ready', {cause: e}));
                if(notify) {
                    await this.notify( {title: `${this.getIdentifier()} - Processing Error`, message: `Cannot start monitoring because Client is not ready: ${truncateStringToLength(500)(messageWithCausesTruncatedDefault(e))}`, priority: 'error'});
                }
                return;
            }
        }

        this.scrobbleQueueAbortController = new AbortController();
        this.scrobbleQueuePromise = spawn(this.scrobbleQueueAbortController.signal, async (signal, { defer, fork }) => {

            defer(async () => {
                this.scrobbling = false;
                this.emitEvent('statusChange', {status: 'Idle'});
            });

            await this.startScrobbling(signal);
        }).catch((e) => {
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Scrobble processing stopped', this.scrobbleQueueAbortController.signal);
                this.logger.info(err);
                this.logger.trace(e)
            } else {
                this.logger.warn(new Error('Scrobble processing stopped with error', { cause: e }));
            }
        }).finally(() => {
            this.scrobbleQueueAbortController = undefined;
            this.scrobbleQueuePromise = undefined;
        });
    }

    startScrobbling = async (signal: AbortSignal) => {
        signal.throwIfAborted();

        // reset poll attempts if already previously run
        this.scrobbleRetries = 0;

        const {
            options: {
                maxRequestRetries = 5,
                retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
            } = {},
        } = this.config;

        // can't have negative retries!
        const maxRetries = Math.max(0, maxRequestRetries);

        if(this.scrobbling === true) {
            this.logger.warn(`Already scrobble processing! Processing needs to be stopped before it can be started`);
            return;
        }

        while (this.scrobbleRetries <= maxRetries) {
            try {
                await this.doProcessing(signal);
            } catch (e) {
                if(isAbortError(e)) {
                    throw e;
                }
                if(!this.isUsable()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer usable.');
                    await this.notify({title: `${this.getIdentifier()} - Processing Error`, message: `Encountered error while scrobble processing and client is no longer usable, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    break;
                } else if (this.authGated()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer being authenticated.');
                    await this.notify({title: `${this.getIdentifier()} - Processing Error`, message: `Encountered error while scrobble processing and client is no longer authenticated, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    break;
                } else if (this.scrobbleRetries < maxRetries) {
                    const delayFor = pollingBackoff(this.scrobbleRetries + 1, retryMultiplier);
                    this.logger.info(`Scrobble processing retries (${this.scrobbleRetries}) less than max processing retries (${maxRetries}), restarting processing after ${delayFor} second delay...`);
                    await this.notify({title: `${this.getIdentifier()} - Processing Retry`, message: `Encountered error while polling but retries (${this.scrobbleRetries}) are less than max poll retries (${maxRetries}), restarting processing after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Scrobble processing retries (${this.scrobbleRetries}) equal to max processing retries (${maxRetries}), stopping processing!`);
                    await this.notify({title: `${this.getIdentifier()} - Processing Error`, message: `Encountered error while scrobble processing and retries (${this.scrobbleRetries}) are equal to max processing retries (${maxRetries}), stopping processing!. | Error: ${e.message}`, priority: 'error'});
                }
                this.scrobbleRetries++;
            }
        }
    }

    tryStopScrobbling = async (reason?: string | Error) => {
        if(this.scrobbling === false) {
            this.logger.warn(`Polling is already stopped!`);
            return;
        }
        if(this.scrobbleQueueAbortController === undefined) {
            this.logger.error('No abort controller found! Nothing to stop.');
            return false;
        }
        this.scrobbleQueueAbortController.abort(reason)
        let timePasssed = 0;
        while(this.scrobbling === true && timePasssed < (this.scrobbleWaitStopInterval * 10)) {
            await sleep(this.scrobbleWaitStopInterval);
            timePasssed += this.scrobbleWaitStopInterval;
            this.logger.verbose(`Waiting for scrobble processing stop signal to be acknowledged (waited ${timePasssed}ms)`);
        }
        if(this.scrobbling === true) {
            this.logger.warn('Could not stop scrobble processing! Or signal was lost :(');
            return false;
        }
        return true;
    }

    protected doProcessing = async (signal: AbortSignal): Promise<true | undefined> => {
        signal.throwIfAborted();
        this.logger.info('Scrobble processing started');
        this.emitEvent('statusChange', {status: 'Running'});

        try {
            this.scrobbling = true;
            if(!this.upstreamRefresh.refreshEnabled) {
                this.logger.verbose('Scrobble refresh is DISABLED. All queued scrobbles will likely always be scrobbled (nothing to check duplicates against).');
            }
            while (true) {
                signal.throwIfAborted();
                //let queueEmpty = await this.playRepo.hasQueueNext(CLIENT_INGRESS_QUEUE); // this.queuedLength; // this.queuedScrobbles.length === 0;
                let nextQueued = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE);
                if(nextQueued !== undefined) {
                    while (nextQueued !== undefined) {
                        await this.processQueueCurrentScrobble(nextQueued, signal);
                        nextQueued = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE)
                    }
                    this.emitEvent('queueEmptied', {});
                }
                await delay(signal, this.scrobbleSleep);
            }
        } catch (e) {
            if(!isAbortError(e)) {
                this.logger.error('Scrobble processing interrupted');
                this.logger.error(e);
            }
            this.emitEvent('statusChange', {status: 'Idle'});
            this.scrobbling = false;
            throw e;
        }
    }

    protected processQueueCurrentScrobble = async (currQueuedPlay: PlaySelectWithQueueStates, signal: AbortSignal) => {
        signal.throwIfAborted();
        //const currQueuedPlay = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE);
        // if (currQueuedPlay === undefined) {
        //     this.logger.trace('Nothing queued');
        //     return;
        // }
        await this.handleQueuedScrobbleRanges();
        if (!this.upstreamRefresh.refreshEnabled) {
            // TODO add signal for this to scrobble match
            this.logger.trace('Scrobble refresh is DISABLED.');
        }

        //let handledShiftedPlay = false;
        //const currQueuedPlay = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE);
        //const currQueuedPlay = this.queuedScrobbles.shift();

        let historicalPlays: PlayObject[] = [];
        let historicalError: Error | undefined;
        let queueError: Error | undefined;
        let successState: PlaySelect['state'];

        try {

            if (this.upstreamRefresh.refreshEnabled) {
                try {
                    historicalPlays = await this.getSOTScrobblesForPlay(currQueuedPlay.play);
                } catch (e) {
                    historicalError = e;
                    if (e.message === 'Cannot get historical plays due to cached error') {
                        this.logger.warn(`${buildTrackString(currQueuedPlay.play)} from Source '${currQueuedPlay.play.meta.source}' => Previous error while getting historical scrobbles means this scrobble cannot be compared, will queue as dead for now.`);
                        this.logger.trace(e);
                        queueError = e;
                    } else {
                        queueError = new SimpleError(`${buildTrackString(currQueuedPlay.play)} from Source '${currQueuedPlay.play.meta.source}' => cannot get historical scrobbles, will queue as dead for now.`, { cause: e, shortStack: true });
                        this.logger.warn(queueError);
                    }
                    await this.addDeadLetterScrobble(currQueuedPlay, e);
                    //handledShiftedPlay = true;
                }
                signal.throwIfAborted();
            }
            if (historicalError === undefined) {
                const { summary, ...matchResult } = await this.existingScrobble(currQueuedPlay.play, historicalPlays);
                signal.throwIfAborted();
                const {
                    scrobble = {},
                    ...lifeRest
                } = currQueuedPlay.play.meta.lifecycle ?? { steps: [], original: currQueuedPlay.play };
                currQueuedPlay.play.meta.lifecycle = {
                    ...lifeRest,
                    scrobble: {
                        ...scrobble,
                        match: matchResult
                    }
                }
                if (!matchResult.match) {
                    const transformedScrobble = await this.transformPlay(currQueuedPlay.play, TRANSFORM_HOOK.postCompare);
                    signal.throwIfAborted();
                    if (transformedScrobble.meta.lifecycle === undefined) {
                        transformedScrobble.meta.lifecycle = {
                            //original: transformedScrobble,
                            steps: []
                        };
                    }
                    try {
                        const scrobbledPlay = await this.scrobble(transformedScrobble, {signal});
                        await this.addScrobbledTrack(scrobbledPlay);
                        //handledShiftedPlay = true;
                    } catch (e) {
                        currQueuedPlay.play.meta.lifecycle.scrobble = {
                        };

                        const submitError = findCauseByReference(e, ScrobbleSubmitError);
                        if (submitError !== undefined) {
                            currQueuedPlay.play.meta.lifecycle.scrobble.payload = submitError.payload;
                            currQueuedPlay.play.meta.lifecycle.scrobble.response = submitError.responseBody;
                            currQueuedPlay.play.meta.lifecycle.scrobble.error = serializeError(submitError);
                        } else {
                            currQueuedPlay.play.meta.lifecycle.scrobble.payload = this.playToClientPayload(transformedScrobble);
                            currQueuedPlay.play.meta.lifecycle.scrobble.error = serializeError(e);
                        }

                        queueError = e;
                        await this.addDeadLetterScrobble(currQueuedPlay, e);
                        //handledShiftedPlay = true;
                        if (hasUpstreamError(e, false)) {
                            //handledShiftedPlay = true;
                            const nonShowStoppingError = new Error(`Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${currQueuedPlay.play.meta.source}' but error was not show stopping. Adding scrobble to Dead Letter Queue and will retry on next heartbeat.`, { cause: e });
                            this.logger.warn(nonShowStoppingError);
                            queueError = nonShowStoppingError;
                        } else {
                            //this.queuedScrobbles.unshift(currQueuedPlay);
                            //handledShiftedPlay = true;
                            const showStoppingError = new Error('Error occurred while trying to scrobble', { cause: e });
                            queueError = showStoppingError;
                            throw showStoppingError;
                        }
                    }
                } else {
                    successState = 'duped';
                }
            }
            signal.throwIfAborted();
            // reset retries if we've made this far
            this.scrobbleRetries = 0;
        } catch (e) {
            if(queueError === undefined) {
                queueError = e;
            }
            // if(!handledShiftedPlay) {
            //     this.queuedScrobbles.unshift(currQueuedPlay);            
            // }
            throw e;
        } finally {
            const queueState = currQueuedPlay.queueStates.find(x => x.queueName === CLIENT_INGRESS_QUEUE);
            if(queueError !== undefined) {
                await this.queueRepo.updateById(queueState.id, {queueStatus: 'failed', error: queueError});
                await this.playRepo.updateById(currQueuedPlay.id, {state: 'failed', error: queueError});
            } else {
                await this.queueRepo.updateById(queueState.id, {queueStatus: 'completed'});
                await this.playRepo.updateById(currQueuedPlay.id, {state: successState ?? 'scrobbled'});
            }
            this.emitEvent('scrobbleDequeued', { queuedScrobble: currQueuedPlay })
            this.queuedGauge.labels(this.getPrometheusLabels()).dec();
            this.queuedLength -= 1;
        }
    }

    processDeadLetterQueue = async (attemptWithRetries?: number) => {

        // if (this.deadLetterScrobbles.length === 0) {
        //     return;
        // }

        if (!(await this.isReady())) {
            this.deadLogger.warn('Cannot process dead letter scrobbles because client is not ready.');
            return;
        }
        if(this.deadQueueAbortController !== undefined) {
            this.deadLogger.warn('Dead scrobbles are currently being processed, cannot restart right now.');
            return;
        }

        const {
            options: {
                deadLetterRetries = 3
            } = {}
        } = this.config;

        const retries = attemptWithRetries ?? deadLetterRetries;
        const removedIds = [];

        this.deadQueueAbortController = new AbortController();
        this.deadQueuePromise = spawn(this.deadQueueAbortController.signal, async (signal, { defer, fork }) => {

            defer(async () => {
                this.deadQueueProcessing = false;
                this.emitEvent('queueState', {queueName: 'dead', status: 'Idle'});
            });

            this.emitEvent('queueState', {queueName: 'dead', status: 'Running'});
            await this.queueRepo.deadFailedToQueue(this.dbComponent.id, retries);

            const processable = await this.queueRepo.getQueueCount(this.dbComponent.id, [CLIENT_DEAD_QUEUE]); //this.deadLetterScrobbles.filter(x => x.retries < retries);
            this.deadLetterQueued = processable;

            const total = await this.queueRepo.getQueueCount(this.dbComponent.id, [CLIENT_DEAD_QUEUE], ['queued','failed']);
            this.deadLetterLength = total;
            const queueStatus = `${processable} of ${total} dead scrobbles have less than ${retries} retries, ${processable === 0 ? 'will skip processing.': 'processing now...'}`;
            if (processable === 0) {
                this.deadLogger.verbose(queueStatus);
                return;
            }
            this.logger.info(queueStatus);
            if(!this.upstreamRefresh.refreshEnabled) {
                this.deadLogger.verbose('Scrobble refresh is DISABLED. All dead scrobbles will likely always be scrobbled (nothing to check duplicates against).');
            }
    //        await this.handleQueuedScrobbleRanges();

            let nextQueued: PlaySelectWithQueueStates = await this.playRepo.getQueueNext(CLIENT_DEAD_QUEUE, {retries});
            if(nextQueued !== undefined) {
                while(nextQueued !== undefined) {
                    const [scrobbled, dead] = await this.processDeadLetterScrobble(nextQueued.uid, signal);
                    await sleep(this.scrobbleSleep);
                    if(scrobbled) {
                        removedIds.push(dead.id);
                    }
                    nextQueued = await this.playRepo.getQueueNext(CLIENT_DEAD_QUEUE, {retries});
                }
            }

        }).catch((e) => {
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Dead scrrobble processing stopped', this.deadQueueAbortController.signal);
                this.logger.info(err);
                this.logger.trace(e)
            } else {
                this.logger.warn(new Error('Dead scrobble processing stopped with error', { cause: e }));
            }
        }).finally(() => {
            if (removedIds.length > 0) {
                this.deadLogger.info(`Removed ${removedIds.length} scrobbles from dead letter queue`);
            }
            this.deadQueueAbortController = undefined;
            this.deadQueuePromise = undefined;
        });
    }

    processDeadLetterScrobble = async (uid: string, signal?: AbortSignal): Promise<[boolean, PlaySelectWithQueueStates?]> => {
        signal?.throwIfAborted();
        // const deadScrobbleIndex = this.deadLetterScrobbles.findIndex(x => x.id === id);
        // if(deadScrobbleIndex === -1) {
        //     this.deadLogger.warn(`Could not find a dead scrobble with id ${id}`);
        //     return [false];
        // }

        
        let deadQueueState: QueueStateSelect;
        let deadScrobble: PlaySelectWithQueueStates = await this.playRepo.findByUid(uid, {hydrate: ['asPlay']});
        if(deadScrobble === undefined) {
            throw new Error(`Play ${uid} does not exist for ${this.name}`);
        }
        if(deadScrobble.state === 'scrobbled') {
            throw new Error(`Play ${uid} is already scrobbled.`);
        }
        deadQueueState = deadScrobble.queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE);
        if(deadQueueState === undefined) {
            throw new Error(`Play ${uid} is not currently queued in dead letter.`);
        }
        //const deadScrobble = await this.playRepo.getQueueNext(this.dbComponent.id, CLIENT_INGRESS_QUEUE);
        const deadLabel = {labels: deadScrobble.uid};
        //const deadScrobble = this.deadLetterScrobbles[deadScrobbleIndex];
        this.deadLogger.trace(deadLabel, `Processing dead scrobble => ${buildTrackString(deadScrobble.play)}`);

        await this.handleQueuedScrobbleRanges();
        signal?.throwIfAborted();

        if (!(await this.isReady())) {
            this.deadLogger.warn(deadLabel, 'Cannot process dead letter scrobble because client is not ready.');
            return [false, deadScrobble];
        }
        let historicalPlays: PlayObject[] = [];
        if(this.upstreamRefresh.refreshEnabled) {
            try {
                historicalPlays = await this.getSOTScrobblesForPlay(deadScrobble.play);
            } catch (e) {
                if(e.message === 'Cannot get historical plays due to cached error') {
                    this.deadLogger.warn(deadLabel, `Previous error while getting historical scrobbles means this scrobble cannot be compared`);
                    this.deadLogger.trace(e);
                } else {
                    this.deadLogger.warn(new SimpleError(`${deadScrobble.uid} - ${buildTrackString(deadScrobble.play)} from Source '${deadScrobble.play.meta.source}' => cannot get historical scrobbles`, {cause: e, shortStack: true}));
                }

                this.queueRepo.updateById(deadQueueState.id, {retries: deadQueueState.retries + 1, error: e, updatedAt: dayjs(), queueStatus: 'failed'});
                this.playRepo.updateById(deadScrobble.id, {error: e});
                // deadScrobble.retries++;
                // deadScrobble.error = messageWithCauses(e);
                // deadScrobble.lastRetry = dayjs();
                // this.deadLetterScrobbles[deadScrobbleIndex] = deadScrobble;
                this.emitEvent('updateDeadLetter', {dead: deadScrobble});
                return [false, deadScrobble];
            }
        }
        signal?.throwIfAborted();
        const {summary, ...matchResult} = await this.existingScrobble(deadScrobble.play, historicalPlays);
        const {
            scrobble = {},
            ...lifeRest
        } = deadScrobble.play.meta.lifecycle ?? {steps: [], original: deadScrobble.play};
        deadScrobble.play.meta.lifecycle = {
            ...lifeRest,
            scrobble: {
                ...scrobble,
                match: matchResult
            }
        }
        if(!matchResult.match) {
            const transformedScrobble = await this.transformPlay(deadScrobble.play, TRANSFORM_HOOK.postCompare);
            signal?.throwIfAborted();
            try {
                const scrobbledPlay = await this.scrobble(transformedScrobble);
                await this.addScrobbledTrack(scrobbledPlay);
                this.removeDeadLetterScrobble(deadScrobble, 'scrobbled', true);
            } catch (e) {

                const submitError = findCauseByReference(e, ScrobbleSubmitError);
                if(submitError !== undefined) {
                    deadScrobble.play.meta.lifecycle.scrobble.payload = submitError.payload;
                    deadScrobble.play.meta.lifecycle.scrobble.response = submitError.responseBody;
                    deadScrobble.play.meta.lifecycle.scrobble.error = serializeError(submitError);
                } else {
                    deadScrobble.play.meta.lifecycle.scrobble.payload = this.playToClientPayload(transformedScrobble);
                    deadScrobble.play.meta.lifecycle.scrobble.error = serializeError(e);
                }

                this.queueRepo.updateById(deadQueueState.id, {retries: deadQueueState.retries + 1, error: e, updatedAt: dayjs(), queueStatus: 'failed'});
                this.playRepo.updateById(deadScrobble.id, {error: e});
                // deadScrobble.retries++;
                // deadScrobble.error = messageWithCauses(e);
                // deadScrobble.lastRetry = dayjs();
                this.deadLogger.error(new Error(`${deadScrobble.uid} - Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${deadScrobble.play.meta.source}' due to error`, {cause: e}));
                //this.deadLetterScrobbles[deadScrobbleIndex] = deadScrobble;
                this.emitEvent('updateDeadLetter', {dead: deadScrobble});
                return [false, deadScrobble];
            }
        } else {
            this.deadLogger.verbose(`Looks like ${buildTrackString(deadScrobble.play)} was already scrobbled!\n${summary}`);
            this.removeDeadLetterScrobble(deadScrobble, 'duped', true);
        }

        return [true, deadScrobble];
    }

    removeDeadLetterScrobble = async (dead: (PlaySelect & {queueStates: QueueStateSelect[]}) | string, state: PlaySelect['state'], success: boolean) => {

        let deadScrobble: PlaySelect & {queueStates: QueueStateSelect[]};

        if(typeof dead === 'string'){
        deadScrobble = await this.playRepo.findByUid(dead, {hydrate: ['asPlay']});
        if(deadScrobble === undefined) {
            throw new Error(`Play ${dead} does not exist for ${this.name}`);
        }
        } else {
            deadScrobble = dead;
        }
        // const index = this.deadLetterScrobbles.findIndex(x => x.id === id);
        // if (index === -1) {
        //     this.deadLogger.warn(`No scrobble found with ID ${id}`);
        //     return;
        // }
        const deadQueueState = deadScrobble.queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE && x.queueStatus !== 'completed');
        const isQueued = deadQueueState.queueStatus === 'queued';
        if(deadQueueState === undefined) {
            throw new Error(`Play ${deadScrobble.uid} is not currently queued in dead letter.`);
        }
        //this.deadLetterScrobbles.splice(index, 1);
        this.deadLetterGauge.labels(this.getPrometheusLabels()).dec();
        let queueUpdate: Partial<QueueStateNew> = {
            updatedAt: dayjs(),
            queueStatus: 'completed'
        }
        if(success) {
            queueUpdate.error = null;
        }
        await this.queueRepo.updateById(deadQueueState.id, queueUpdate);
        await this.playRepo.updateById(deadScrobble.id, removeUndefinedKeys({state, error: success ? null : undefined}));
        this.deadLogger.info({labels: deadScrobble.uid}, `Scrobble ${buildTrackString(deadScrobble.play)} marked as completed`);
        this.deadLetterLength -= 1;
        if(isQueued) {
            this.deadLetterQueued -= 1;
        }
        if(state === 'scrobbled') {
            this.componentRepo.updateById(this.dbComponent.id, {countLive: this.dbComponent.countLive + 1});
        }
        this.emitEvent('removeDeadLetter', { dead: { id: deadScrobble.uid } });
    }

    removeDeadLetterScrobbles = async (types: QueueStateSelect['queueStatus'][] = ['queued'], state: PlaySelect['state'], success: boolean) => {
        const ids = await this.playRepo.findPlayIdentifiers({
            queues: [
                {
                    queueName: CLIENT_DEAD_QUEUE,
                    queueStatus: types
                }
            ]
        }, 'uid');
        this.deadLogger.info(`Marking ${ids} as completed but unsuccessful...`);
        await Promise.all(ids.map((x) => this.removeDeadLetterScrobble(x, state, success)));
        this.deadLogger.info('Finished processing dead scrobbles.');
        await this.updateQueueStats([CLIENT_DEAD_QUEUE]);
    }

    queueScrobble = async (data: PlayObject | PlayObject[], source: string) => {
        const playDatas = (Array.isArray(data) ? data : [data]).map(x => ({...x, meta: {...x.meta, seenAt: dayjs()}}));

        const createdQueuedPlays: PlaySelect[] = [];

        for await(const play of pMapIterable(playDatas, this.staggerMappers.preCompare(async x => await this.transformPlay(x, TRANSFORM_HOOK.preCompare)), {concurrency: 3})) {
            try {
                // cheap check, looks for play data (non-meta) hash, playdate, and optionally mbid recording
                const cheapExisting = await this.playRepo.checkExisting(play, {queueName: CLIENT_INGRESS_QUEUE});
                if(cheapExisting !== undefined) {
                    const qs = cheapExisting.queueStates.find(x => x.queueName === CLIENT_INGRESS_QUEUE);
                    this.logger.trace(`Not adding to queue because it is already in the queue, discovered via hash/mbid, last queued at ${todayAwareFormat(qs.createdAt)}`);
                    continue;
                }
                // then chunked queued plays
                let offset = 0;
                let inQueue = false;
                while(true) {
                    const {data, meta} = await this.playRepo.getQueued(CLIENT_INGRESS_QUEUE, {offset});
                    const existingQueued = await this.existingScrobble(play, data.map(x => asPlay(x.play)), false);
                     // want to be very confident of this
                    if(existingQueued.match && existingQueued.score > 0.99) {
                        this.logger.trace(`Not adding to queue because it is already in the queue\n${existingQueued.summary}`);
                        inQueue = true;
                        break;
                    }
                    if(data.length < meta.limit) {
                        break;
                    }
                    offset += meta.limit;
                }

                if(inQueue) {
                    continue;
                }
                
                // not in queue!
                const {
                    meta: {
                        // dbId,
                        // dbUid,
                        lifecycle,
                        ...metaRest
                    },
                } = play
            const createPlayData = playToRepositoryCreatePlayOpts({
                play: {
                    ...play,
                    meta: {
                        ...metaRest,
                        lifecycle: {
                            steps: []
                        }
                    }
                },
                componentId: this.dbComponent.id, 
                state: 'queued',
                parentId: play.id
            });

            const playRow = await this.playRepo.createPlays([createPlayData]);
            await this.queueRepo.create({componentId: this.dbComponent.id, playId: playRow[0].id, queueName: CLIENT_INGRESS_QUEUE});
            createdQueuedPlays.push(playRow[0]);
            this.logger.debug(`Added ${buildTrackString(play)} to the queue`);

            } catch (e) {
                this.logger.warn(new SimpleError('Failed to check queued scrobble for existing before adding', {cause: e}));
            }
            const queuedPlay = {id: nanoid(), source, play: play}
            //await this.playRepo.updateById(play.meta.dbId, {play});
            this.emitEvent('scrobbleQueued', {queuedPlay: queuedPlay});
            this.queuedLength += 1;
            //this.queuedScrobbles.push(queuedPlay);
            this.queuedGauge.labels(this.getPrometheusLabels()).inc();
            // this is wasteful but we don't want the processing loop popping out-of-order (by date) scrobbles
            //this.queuedScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        }
        return createdQueuedPlays;
    }

    addDeadLetterScrobble = async (data: PlaySelect, error: (Error | string) = 'Unspecified error') => {
        let eString = '';
        if(typeof error === 'string') {
            eString = error;
        } else {
            eString = messageWithCauses(error);
        }
        let e: ErrorLike;
        if(isErrorLike(error)) 
        {
            e = error;
        } else if(typeof error === 'string') {
            e = new Error(error);
        }
        this.deadLetterLength += 1;
        this.deadLetterQueued += 1;
        //this.playRepo.updateById(data.id, {state: 'failed', error: e});
        await this.queueRepo.create({
            componentId: this.dbComponent.id,
            playId: data.id,
            queueName: CLIENT_DEAD_QUEUE
        });
        // TODO ?
        const deadData = {id: nanoid(), retries: 0, error: eString, play: data.play};
        //this.deadLetterScrobbles.push(deadData);
        //this.deadLetterScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        this.emitEvent('deadLetter', {dead: deadData});
        this.deadLetterGauge.labels(this.getPrometheusLabels()).inc();
    }

    queuePlayingNow = async (data: SourcePlayerObj, source: SourceIdentifier) => {
        if(!this.isReady()) {
            this.logger.debug('Not queueing play because scrobbler is not ready');
            return;
        }
        const sourceId = `${source.name}-${source.type}`;
        if(data.play !== undefined) {
            const transformed = await this.transformPlay(data.play, TRANSFORM_HOOK.preCompare);
            data.play = transformed;
        }
        if(isDebugMode()) {
            let playHint = '';
            if(data.play !== undefined) {
                playHint = ` with Play ${buildTrackString(data.play, {include: ['artist', 'track', 'platform']})}`
            }
            this.npLogger.debug(`Queueing Player ${platformTruncate(data.platformId)} ${data.status.calculated.toLocaleUpperCase()}${playHint} from ${sourceId}`);
        }
        const platformPlays = this.nowPlayingQueue.get(sourceId) ?? new Map();
        platformPlays.set(data.platformId, {player: data, source});
        this.nowPlayingQueue.set(sourceId, platformPlays);
    }

    processingPlayingNow = async (): Promise<void> => {
        if(!this.supportsNowPlaying || !this.isReady()) {
            return;
        }
        if(this.nowPlayingInit === false) {
            this.initializeNowPlaying();
        }
        if(this.nowPlayingEnabled) {
            const sourcePlayerData = this.nowPlayingFilter(this.nowPlayingQueue);
            if(sourcePlayerData === undefined) {
                return;
            }
            let shouldUpdate: boolean,
            clientReason: string | undefined;
            const [npUpdateTop, npUpdateTopReason] = this.shouldUpdatePlayingNowResult(sourcePlayerData);
            shouldUpdate = npUpdateTop;
            if(!npUpdateTop) {
                this.npLogger.trace(`Not updating because ${npUpdateTopReason}`);
            } else {
                const [clientUpdate, clientUpdateReason, level] = await this.shouldUpdatePlayingNowPlatformSpecific(sourcePlayerData);
                clientReason = clientUpdateReason;
                shouldUpdate = clientUpdate;
                if(!clientUpdate) {
                    this.npLogger[level ?? 'trace'](`Not updating, ${npUpdateTopReason} --BUT-- ${clientUpdateReason}`);
                }
            }
            if(shouldUpdate) {
                this.npLogger.verbose(`Updating because ${npUpdateTopReason}${clientReason !== undefined ? ` --AND-- ${clientReason}` : ''}`);
                try {
                    await this.doPlayingNow(sourcePlayerData);
                    this.npLogger.trace(`Now Playing updated.`);
                    this.emitEvent('nowPlayingUpdated', sourcePlayerData);
                } catch (e) {
                    this.npLogger.warn(new Error('Error occurred while trying to update upstream Client, will ignore', {cause: e}));
                }
                this.nowPlayingLastPlay = sourcePlayerData;
                this.nowPlayingLastUpdated = dayjs();
            }
            this.nowPlayingQueue = new Map();
        }
    }

    shouldUpdatePlayingNowResult = (data: SourcePlayerObj): [boolean, string?] => {
        if(this.nowPlayingLastPlay === undefined || this.nowPlayingLastUpdated === undefined) {
            return [true, 'Now Playing has not yet been set'];
        }

        if(data.play.data.track === undefined) {
            return [false, 'play is missing track information'];
        }
        if((data.play.data.artists ?? []).length === 0) {
            return [false, 'play is missing artist information'];
        }

        const lastUpdateDiff = Math.abs(dayjs().diff(this.nowPlayingLastUpdated, 's'));

        const playExistingDiscrepancy = (this.nowPlayingLastPlay.play !== undefined && data.play === undefined) || (this.nowPlayingLastPlay === undefined && data.play !== undefined);
        const bothPlaysExist = this.nowPlayingLastPlay.play !== undefined && data.play !== undefined;

        const playerStatusChanged = this.nowPlayingLastPlay.status.calculated !== data.status.calculated;

        // update if play *has* changed and time since last update is greater than min interval
        // this prevents spamming scrobbler API with updates if user is skipping tracks and source updates frequently
        if(this.nowPlayingMinThreshold(data.play) < lastUpdateDiff && (playExistingDiscrepancy || playerStatusChanged || (bothPlaysExist && !playObjDataMatch(data.play, this.nowPlayingLastPlay.play)))) {
            return [true, `New Play differs from previous Now Playing and time since update ${lastUpdateDiff}s, greater than threshold ${this.nowPlayingMinThreshold(data.play)}`];
        }
        // update if play *has not* changed but last update is greater than max interval
        // this keeps scrobbler Now Playing fresh ("active" indicator) in the event play is long
        if(this.nowPlayingMaxThreshold(data.play) < lastUpdateDiff && (bothPlaysExist && playObjDataMatch(data.play, this.nowPlayingLastPlay.play))) {
            return [true, `Now Playing last updated ${lastUpdateDiff}s ago, greater than threshold ${this.nowPlayingMaxThreshold(data.play)}s`];
        }

        return [false, `Now Playing ${bothPlaysExist && playObjDataMatch(data.play, this.nowPlayingLastPlay.play) ? 'matches' : 'does not match'} and was last updated ${lastUpdateDiff}s ago (threshold ${this.nowPlayingMaxThreshold(data.play)}s)`];
    }

    shouldUpdatePlayingNow = (data: SourcePlayerObj): boolean => {
        return this.shouldUpdatePlayingNowResult(data)[0];
    }

    /** Implement this for specific requirements for updating playing now based on the scrobbler platform */
    protected shouldUpdatePlayingNowPlatformSpecific(data: SourcePlayerObj): Promise<[boolean, string?, LogLevel?]> {
        return shouldUpdatePlayingNowPlatformWhenPlayingOnly(data);
    }

    protected doPlayingNow = (data: SourcePlayerObj): Promise<any> => Promise.resolve(undefined)

    public getQueued = (queueName: string, statuses: string[], offset?: number) => {
        return this.playRepo.getQueued(queueName, {offset});
    }

    public getPlaysPaginated = (args: QueryPlaysOpts) => {
        const {
            limit,
            offset,
            with: withQuery = ['input','parent-input','queues'],
            ...rest
        } = args;
        let parsedLimit = limit !== undefined ? Number.parseInt(limit as unknown as string) : undefined;
        let parsedOffset = offset !== undefined ? Number.parseInt(offset as unknown as string) : undefined;
        return this.playRepo.findPlaysPaginated({limit: parsedLimit, offset: parsedOffset, with: withQuery, ...rest});
    }

    public emitEvent = (eventName: string, payload: object) => {
        this.emitter.emit(eventName, {
            data: payload,
            type: this.type,
            name: this.name,
            from: 'client'
        });
    }
}

export const nowPlayingUpdateByPlayDuration: NowPlayingUpdateThreshold = (play?: PlayObject) => {
    if(play === undefined) {
        31;
    }
    return (play?.data?.duration ?? 30) + 1;
}

export const shouldUpdatePlayingNowPlatformWhenPlayingOnly = async (data: SourcePlayerObj): Promise<[boolean, string]> => {
    if(data.status.calculated === CALCULATED_PLAYER_STATUSES.playing || (data.nowPlayingMode && !CALCULATED_PLAYER_STATUSES.stopped)) {
        return [true, `calculated player status is ${data.status.calculated}`];
    }
    return [false, `calculated player status is ${data.status.calculated} but must be played/stopped`];
}