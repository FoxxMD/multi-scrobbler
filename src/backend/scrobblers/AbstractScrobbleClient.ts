import { childLogger, Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import { FixedSizeList } from 'fixed-size-list';
import { nanoid } from "nanoid";
import { MarkOptional } from "ts-essentials";
import {
    DeadLetterScrobble,
    NowPlayingUpdateThreshold,
    PlayObject,
    PlayObjectLifecycleless,
    QueuedScrobble, ScrobbleActionResult, PlayMatchResult, SourcePlayerObj, TA_DURING,
    TA_FUZZY,
    TrackStringOptions,
    TA_EXACT,
    SOURCE_SOT
} from "../../core/Atomic.js";
import { buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.js";
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
    sleep,
    sortByOldestPlayDate,
} from "../utils.js";
import { findCauseByReference, messageWithCauses, messageWithCausesTruncatedDefault } from "../utils/ErrorUtils.js";
import {
    comparePlayTemporally,
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
import {serializeError} from 'serialize-error';
import { DEFAULT_NEW_PADDING, groupPlaysToTimeRanges } from "../utils/ListenFetchUtils.js";
import { spawn, catchAbortError, isAbortError, rethrowAbortError, delay, forever, AbortError, throwIfAborted } from 'abort-controller-x';

type PlatformMappedPlays = Map<string, {player: SourcePlayerObj, source: SourceIdentifier}>;
type NowPlayingQueue = Map<string, PlatformMappedPlays>;

const platformTruncate = truncateStringToLength(10);

export default abstract class AbstractScrobbleClient extends AbstractComponent implements Authenticatable {

    name: string;
    type: ClientType;

    scheduler: ToadScheduler = new ToadScheduler();

    protected MAX_STORED_SCROBBLES = 40;
    protected MAX_INITIAL_SCROBBLES_FETCH = this.MAX_STORED_SCROBBLES;

    scrobbleSOTRanges: PaginatedTimeRangeOptions[] = [];
    scrobbledPlayObjs: FixedSizeList<ScrobbledPlayObject>;
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
    scrobbleRetries: number =  0;
    scrobbling: boolean = false;
    queuedScrobbles: QueuedScrobble<PlayObject>[] = [];
    deadLetterScrobbles: DeadLetterScrobble<PlayObject>[] = [];

    supportsNowPlaying: boolean = false;
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
        existing: staggerMapper<ScrobbledPlayObject, ScrobbledPlayObject>({concurrency: 2})
    }

    constructor(type: any, name: any, config: CommonClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super(config);
        this.type = type;
        this.name = name;
        this.logger = childLogger(logger, this.getIdentifier());
        this.npLogger = childLogger(this.logger, 'Now Playing');
        this.dupeLogger = childLogger(this.logger, 'Dupe');
        this.deadLogger = childLogger(this.logger, 'Dead');
        this.notifier = notifier;
        this.emitter = emitter;
        this.scrobbledPlayObjs = new FixedSizeList<ScrobbledPlayObject>(this.MAX_STORED_SCROBBLES);

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

    protected async postCache(): Promise<void> {
        await super.postCache();
        this.generateStaggerMappers();
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
            this.staggerMappers.existing = staggerMapper<ScrobbledPlayObject, ScrobbledPlayObject>({initialInterval: Math.max(...eInits), maxRandomStagger: Math.max(...eMaxStagger), concurrency: 3});
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
            this.initializeNowPlayingSchedule();
        } else {
            this.npLogger.debug('Unsupported feature, disabled.');
        }
    }

    protected initializeNowPlayingSchedule() {

        const t = new AsyncTask('Playing Now', (): Promise<any> => {
            return this.processingPlayingNow();
        }, (err: Error) => {
            this.npLogger.error(new Error('Unexpected error while processing Now Playing queue', {cause: err}));
        });

        this.scheduler.removeById('pn_task');

        // even though we are processing every 5 seconds the interval that Now Playing is updated at, and that the queue is cleared on,
        // is still set by shouldUpdatePlayingNow()
        // 5 seconds makes sure our granularity for updates is decently fast *when* we do need to actually update
        this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({milliseconds: this.nowPlayingTaskInterval}, t, {id: 'pn_task'}));
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
                        if (platform === this.nowPlayingLastPlay.platformId) {
                            return data.player;
                        }
                    }
                }

                // otherwise sort platform alphabetically and take first
                plays.sort((a, b) => a[0].localeCompare(b[0]));
                return plays[0][1].player;
            }
        }
    }

    protected async doParseCache(): Promise<true | string | undefined> {
        const cachedQueue = (await this.cache.cacheScrobble.get(`${this.getMachineId()}-queue`) as QueuedScrobble<PlayObject>[] ?? []);
        const cachedQLength = cachedQueue.length;
        this.queuedScrobbles = cachedQueue.map(x => ({...x, play: rehydratePlay(x.play)}));

        const cachedDead = (await this.cache.cacheScrobble.get(`${this.getMachineId()}-dead`) as DeadLetterScrobble<PlayObject>[] ?? []);
        const cachedDLength = cachedDead.length;
        this.deadLetterScrobbles = cachedDead.map(x => ({...x, play: rehydratePlay(x.play), lastRetry: x.lastRetry !== undefined ? dayjs(x.lastRetry) : undefined}));

        return `Scrobbles from Cache: ${cachedQLength} Queue | ${cachedDLength} Dead Letter`;
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

    handleQueuedScrobbleRanges = () => {
        this.scrobbleSOTRanges = groupPlaysToTimeRanges(this.queuedScrobbles.map(x => x.play).concat(this.deadLetterScrobbles.map(x => x.play)), this.scrobbleSOTRanges, {staleNowBuffer: this.config.options?.refreshStaleAfter});
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

    addScrobbledTrack = (playObj: PlayObject, scrobbledPlay: PlayObjectLifecycleless) => {
        this.scrobbledPlayObjs.add({play: playObj, scrobble: scrobbledPlay});
        this.scrobbledCounter.labels(this.getPrometheusLabels()).inc();
        //this.lastScrobbledPlayDate = playObj.data.playDate;
        this.tracksScrobbled++;
    }

    getScrobbledPlays = () => this.scrobbledPlayObjs.data.map(x => x.play)

    findExistingSubmittedPlayObj = async (playObjPre: PlayObject): Promise<([undefined, undefined] | [ScrobbledPlayObject, ScrobbledPlayObject[]])> => {

        const playObj = await this.transformPlay(playObjPre, TRANSFORM_HOOK.candidate);

        const dtInvariantMatches = (await pMap(this.scrobbledPlayObjs.data, this.staggerMappers.existing(async x => ({...x, play: await this.transformPlay(x.play, TRANSFORM_HOOK.existing)})), {concurrency: 3}))
            .filter(x => playObjDataMatch(playObj, x.play));

        if (dtInvariantMatches.length === 0) {
            return [undefined, []];
        }

        const matchPlayDate = dtInvariantMatches.find((x: ScrobbledPlayObject) => {
            const temporalComparison = comparePlayTemporally(x.play, playObj);
            return hasAcceptableTemporalAccuracy(temporalComparison.match)
        });

        return [matchPlayDate, dtInvariantMatches];
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
                let queueEmpty = this.queuedScrobbles.length === 0;
                while (this.queuedScrobbles.length > 0) {
                    await this.processQueueCurrentScrobble(signal);
                }
                if(!queueEmpty) {
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

    protected processQueueCurrentScrobble = async (signal: AbortSignal) => {
        signal.throwIfAborted();
        if (this.queuedScrobbles.length === 0) {
            return;
        }

        this.handleQueuedScrobbleRanges();
        if (!this.upstreamRefresh.refreshEnabled) {
            // TODO add signal for this to scrobble match
            this.logger.trace('Scrobble refresh is DISABLED.');
        }

        let handledShiftedPlay = false;
        const currQueuedPlay = this.queuedScrobbles.shift();

        let historicalPlays: PlayObject[] = [];
        let historicalError: Error | undefined;

        try {

            if (this.upstreamRefresh.refreshEnabled) {
                try {
                    historicalPlays = await this.getSOTScrobblesForPlay(currQueuedPlay.play);
                } catch (e) {
                    historicalError = e;
                    if (e.message === 'Cannot get historical plays due to cached error') {
                        this.logger.warn(`${buildTrackString(currQueuedPlay.play)} from Source '${currQueuedPlay.source}' => Previous error while getting historical scrobbles means this scrobble cannot be compared, will queue as dead for now.`);
                        this.logger.trace(e);
                    } else {
                        this.logger.warn(new SimpleError(`${buildTrackString(currQueuedPlay.play)} from Source '${currQueuedPlay.source}' => cannot get historical scrobbles, will queue as dead for now.`, { cause: e, shortStack: true }));
                    }
                    this.addDeadLetterScrobble(currQueuedPlay, e);
                    handledShiftedPlay = true;
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
                            original: transformedScrobble,
                            steps: []
                        };
                    }
                    try {
                        const scrobbledPlay = await this.scrobble(transformedScrobble, {signal});
                        this.emitEvent('scrobble', { play: transformedScrobble });
                        this.addScrobbledTrack(scrobbledPlay, scrobbledPlay.meta.lifecycle.scrobble.mergedScrobble ?? scrobbledPlay);
                        handledShiftedPlay = true;
                        signal.throwIfAborted();
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

                        if (hasUpstreamError(e, false)) {
                            this.addDeadLetterScrobble(currQueuedPlay, e);
                            handledShiftedPlay = true;
                            this.logger.warn(new Error(`Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${currQueuedPlay.source}' but error was not show stopping. Adding scrobble to Dead Letter Queue and will retry on next heartbeat.`, { cause: e }));
                        } else {
                            this.queuedScrobbles.unshift(currQueuedPlay);
                            handledShiftedPlay = true;
                            this.updateQueuedScrobblesCache();
                            throw new Error('Error occurred while trying to scrobble', { cause: e });
                        }
                    }
                }
            }
            this.updateQueuedScrobblesCache();
            this.queuedGauge.labels(this.getPrometheusLabels()).set(this.queuedScrobbles.length);
            this.emitEvent('scrobbleDequeued', { queuedScrobble: currQueuedPlay })
            signal.throwIfAborted();
            // reset retries if we've made this far
            this.scrobbleRetries = 0;
        } catch (e) {
            if(!handledShiftedPlay) {
                this.queuedScrobbles.unshift(currQueuedPlay);            
            }
            throw e;
        }
    }

    processDeadLetterQueue = async (attemptWithRetries?: number) => {

        if (this.deadLetterScrobbles.length === 0) {
            return;
        }

        const {
            options: {
                deadLetterRetries = 3
            } = {}
        } = this.config;

        const retries = attemptWithRetries ?? deadLetterRetries;

        const processable = this.deadLetterScrobbles.filter(x => x.retries < retries);
        const queueStatus = `${processable.length} of ${this.deadLetterScrobbles.length} dead scrobbles have less than ${retries} retries, ${processable.length === 0 ? 'will skip processing.': 'processing now...'}`;
        if (processable.length === 0) {
            this.deadLogger.verbose(queueStatus);
            return;
        }
        this.logger.info(queueStatus);
        if(!this.upstreamRefresh.refreshEnabled) {
            this.deadLogger.verbose('Scrobble refresh is DISABLED. All dead scrobbles will likely always be scrobbled (nothing to check duplicates against).');
        }
        this.handleQueuedScrobbleRanges();

        const removedIds = [];
        for (const deadScrobble of processable) {
            const [scrobbled, dead] = await this.processDeadLetterScrobble(deadScrobble.id);
            if (scrobbled) {
                removedIds.push(deadScrobble.id);
            }
            await sleep(this.scrobbleSleep);
        }
        if (removedIds.length > 0) {
            this.deadLogger.info(`Removed ${removedIds.length} scrobbles from dead letter queue`);
        }
    }

    processDeadLetterScrobble = async (id: string): Promise<[boolean, DeadLetterScrobble<PlayObject>?]> => {
        const deadScrobbleIndex = this.deadLetterScrobbles.findIndex(x => x.id === id);
        if(deadScrobbleIndex === -1) {
            this.deadLogger.warn(`Could not find a dead scrobble with id ${id}`);
            return [false];
        }
        const deadLabel = {labels: id};
        const deadScrobble = this.deadLetterScrobbles[deadScrobbleIndex];
        this.deadLogger.trace(deadLabel, `Processing dead scrobble => ${buildTrackString(deadScrobble.play)}`);

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
                    this.deadLogger.warn(new SimpleError(`${id} - ${buildTrackString(deadScrobble.play)} from Source '${deadScrobble.source}' => cannot get historical scrobbles`, {cause: e, shortStack: true}));
                }
                deadScrobble.retries++;
                deadScrobble.error = messageWithCauses(e);
                deadScrobble.lastRetry = dayjs();
                this.deadLetterScrobbles[deadScrobbleIndex] = deadScrobble;
                this.updateDeadLetterCache();
                this.emitEvent('updateDeadLetter', {dead: deadScrobble});
                return [false, deadScrobble];
            }
        }
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
            try {
                const scrobbledPlay = await this.scrobble(transformedScrobble);
                this.emitEvent('scrobble', {play: transformedScrobble});
                this.addScrobbledTrack(transformedScrobble, scrobbledPlay);
                this.removeDeadLetterScrobble(deadScrobble.id)
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

                deadScrobble.retries++;
                deadScrobble.error = messageWithCauses(e);
                deadScrobble.lastRetry = dayjs();
                this.deadLogger.error(new Error(`${id} - Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${deadScrobble.source}' due to error`, {cause: e}));
                this.deadLetterScrobbles[deadScrobbleIndex] = deadScrobble;
                this.updateDeadLetterCache();
                this.emitEvent('updateDeadLetter', {dead: deadScrobble});
                return [false, deadScrobble];
            }
        } else {
            this.deadLogger.verbose(`Looks like ${buildTrackString(deadScrobble.play)} was already scrobbled!\n${summary}`);
            this.removeDeadLetterScrobble(deadScrobble.id)
        }

        return [true, deadScrobble];
    }

    removeDeadLetterScrobble = (id: string) => {
        const index = this.deadLetterScrobbles.findIndex(x => x.id === id);
        if (index === -1) {
            this.deadLogger.warn(`No scrobble found with ID ${id}`);
            return;
        }
        this.deadLogger.info({labels: id}, `Removed scrobble ${buildTrackString(this.deadLetterScrobbles[index].play)} from queue`);
        this.deadLetterScrobbles.splice(index, 1);
        this.deadLetterGauge.labels(this.getPrometheusLabels()).set(this.deadLetterScrobbles.length);
        this.updateDeadLetterCache();
        this.emitEvent('removeDeadLetter', { dead: { id } });
    }

    removeDeadLetterScrobbles = () => {
        this.deadLetterScrobbles = [];
        this.updateDeadLetterCache();
        this.deadLetterGauge.labels(this.getPrometheusLabels()).set(this.deadLetterScrobbles.length);
        this.logger.info('Removed all scrobbles from queue', {leaf: 'Dead Letter'});
    }

    queueScrobble = async (data: PlayObject | PlayObject[], source: string) => {
        const plays = (Array.isArray(data) ? data : [data]).map(x => ({...x, meta: {...x.meta, seenAt: dayjs()}}));
        for await(const play of pMapIterable(plays, this.staggerMappers.preCompare(async x => await this.transformPlay(x, TRANSFORM_HOOK.preCompare)), {concurrency: 3})) {
            try {
                const existingQueued = await this.existingScrobble(play, this.queuedScrobbles.map(x => x.play), false);
                // want to be very confident of this
                if(existingQueued.match && existingQueued.score > 0.99) {
                    this.logger.trace(`Not adding to queue because it is already in the queue\n${existingQueued.summary}`);
                    return;
                }
            } catch (e) {
                this.logger.warn(new SimpleError('Failed to check queued scrobble for existing before adding', {cause: e}));
            }
            const queuedPlay = {id: nanoid(), source, play: play}
            this.emitEvent('scrobbleQueued', {queuedPlay: queuedPlay});
            this.queuedScrobbles.push(queuedPlay);
            this.queuedGauge.labels(this.getPrometheusLabels()).inc();
            // this is wasteful but we don't want the processing loop popping out-of-order (by date) scrobbles
            this.queuedScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        }
        this.updateQueuedScrobblesCache();
    }

    cancelQueuedItemsBySource = (source: string): number => {
        const beforeMain = this.queuedScrobbles.length;
        const beforeDead = this.deadLetterScrobbles.length;

        this.queuedScrobbles = this.queuedScrobbles.filter(item => item.source !== source);
        this.deadLetterScrobbles = this.deadLetterScrobbles.filter(item => item.source !== source);

        this.updateQueuedScrobblesCache();
        this.updateDeadLetterCache();

        return (beforeMain + beforeDead) - (this.queuedScrobbles.length + this.deadLetterScrobbles.length);
    }

    addDeadLetterScrobble = (data: QueuedScrobble<PlayObject>, error: (Error | string) = 'Unspecified error') => {
        let eString = '';
        if(typeof error === 'string') {
            eString = error;
        } else {
            eString = messageWithCauses(error);
        }
        const deadData = {id: nanoid(), retries: 0, error: eString, ...data};
        this.deadLetterScrobbles.push(deadData);
        this.deadLetterScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        this.emitEvent('deadLetter', {dead: deadData});
        this.deadLetterGauge.labels(this.getPrometheusLabels()).set(this.deadLetterScrobbles.length);
        this.updateDeadLetterCache();
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
        if(this.supportsNowPlaying && this.nowPlayingEnabled) {
            const sourcePlayerData = this.nowPlayingFilter(this.nowPlayingQueue);
            if(sourcePlayerData === undefined) {
                return;
            }
            if(this.shouldUpdatePlayingNow(sourcePlayerData) && (await this.shouldUpdatePlayingNowPlatformSpecific(sourcePlayerData))) {
                try {
                    await this.doPlayingNow(sourcePlayerData);
                    this.npLogger.debug(`Now Playing updated.`);
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

    shouldUpdatePlayingNow = (data: SourcePlayerObj): boolean => {
        if(this.nowPlayingLastPlay === undefined || this.nowPlayingLastUpdated === undefined) {
            if(isDebugMode()) {
                this.npLogger.debug(`Now Playing has not yet been set! Should update`);
            }
            return true;
        }

        const lastUpdateDiff = Math.abs(dayjs().diff(this.nowPlayingLastUpdated, 's'));

        const playExistingDiscrepancy = (this.nowPlayingLastPlay.play !== undefined && data.play === undefined) || (this.nowPlayingLastPlay === undefined && data.play !== undefined);
        const bothPlaysExist = this.nowPlayingLastPlay.play !== undefined && data.play !== undefined;

        const playerStatusChanged = this.nowPlayingLastPlay.status.calculated !== data.status.calculated;

        // update if play *has* changed and time since last update is greater than min interval
        // this prevents spamming scrobbler API with updates if user is skipping tracks and source updates frequently
        if(this.nowPlayingMinThreshold(data.play) < lastUpdateDiff && (playExistingDiscrepancy || playerStatusChanged || (bothPlaysExist && !playObjDataMatch(data.play, this.nowPlayingLastPlay.play)))) {
            if(isDebugMode()) {
                this.npLogger.debug(`New Play differs from previous Now Playing and time since update ${lastUpdateDiff}s, greater than threshold ${this.nowPlayingMinThreshold(data.play)}. Should update`);
            }
            return true;
        }
        // update if play *has not* changed but last update is greater than max interval
        // this keeps scrobbler Now Playing fresh ("active" indicator) in the event play is long
        if(this.nowPlayingMaxThreshold(data.play) < lastUpdateDiff && (bothPlaysExist && playObjDataMatch(data.play, this.nowPlayingLastPlay.play))) {
            if(isDebugMode()) {
                this.npLogger.debug(`Now Playing last updated ${lastUpdateDiff}s ago, greater than threshold ${this.nowPlayingMaxThreshold(data.play)}s. Should update`);
            }
            return true;
        }

        if(isDebugMode()) {
            this.npLogger.debug(`Now Playing ${bothPlaysExist && playObjDataMatch(data.play, this.nowPlayingLastPlay.play) ? 'matches' : 'does not match'} and was last updated ${lastUpdateDiff}s ago (threshold ${this.nowPlayingMaxThreshold(data.play)}s), not updating`);
        }
        return false;
    }

    /** Implement this for specific requirements for updating playing now based on the scrobbler platform */
    protected shouldUpdatePlayingNowPlatformSpecific(data: SourcePlayerObj): Promise<boolean> {
        return shouldUpdatePlayingNowPlatformWhenPlayingOnly(data);
    }

    protected doPlayingNow = (data: SourcePlayerObj): Promise<any> => Promise.resolve(undefined)


    public emitEvent = (eventName: string, payload: object) => {
        this.emitter.emit(eventName, {
            data: payload,
            type: this.type,
            name: this.name,
            from: 'client'
        });
    }

    protected updateDeadLetterCache = () => {
        this.cache.cacheScrobble.set(`${this.getMachineId()}-dead`, this.deadLetterScrobbles)
        .then(() => null)
        .catch((e) => this.logger.warn(new Error('Error while updating dead letter cache', {cause: e})));
    }

    protected updateQueuedScrobblesCache = () => {
        this.cache.cacheScrobble.set(`${this.getMachineId()}-queue`, this.queuedScrobbles)
        .then(() => {
            return undefined;
        })
        .catch((e) => {
            this.logger.warn(new Error('Error while updating queued scrobble cache', {cause: e}))
    });
    }
}

export const nowPlayingUpdateByPlayDuration: NowPlayingUpdateThreshold = (play?: PlayObject) => {
    if(play === undefined) {
        31;
    }
    return (play?.data?.duration ?? 30) + 1;
}

export const shouldUpdatePlayingNowPlatformWhenPlayingOnly = async (data: SourcePlayerObj): Promise<boolean> => {
    return (data.status.calculated === CALCULATED_PLAYER_STATUSES.playing)
    || (data.nowPlayingMode && !CALCULATED_PLAYER_STATUSES.stopped);
}