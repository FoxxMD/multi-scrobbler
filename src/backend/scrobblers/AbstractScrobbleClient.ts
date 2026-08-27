import { childLogger, type Logger, type LogLevel } from "@foxxmd/logging";
import dayjs, { type Dayjs } from "dayjs";
import type {Duration} from "dayjs/plugin/duration.js";
import type EventEmitter from "events";
import { nanoid } from "nanoid";
import type { MarkOptional } from "ts-essentials";
import {
    type NowPlayingUpdateThreshold,
    type PlayObject,
    type ScrobbleActionResult, type PlayMatchResult, type SourcePlayerObj,
    INGRESS_QUEUE,
    DEAD_QUEUE,
    type SourcePlayerJson,
    QUEUE_STATUS_COMPLETED,
    SOURCE_SOT,
    QUEUE_STATUS_FAILED,
    isPlayObject,
    DEAD_LETTER_RETRIES_DEFAULT,
    PARSED_FROM
} from "../../core/Atomic.ts";
import { buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.ts";
import AbstractComponent from "../common/AbstractComponent.ts";
import { hasUpstreamError } from "../common/errors/UpstreamError.ts";
import {
    type Authenticatable,
    DEFAULT_RETRY_MULTIPLIER,
    type FormatPlayObjectOptions,
    type PaginatedTimeRangeOptions,
    REFRESH_STALE_DEFAULT,
    type ScrobbledPlayObject,
    type SourceIdentifier,
    type TimeRangeListensFetcher,
} from "../common/infrastructure/Atomic.ts";
import { CALCULATED_PLAYER_STATUSES } from '../../core/Atomic.ts';
import type {QueueContext, ReportedPlayerStatus, ScrobbleResult} from '../../core/Atomic.ts';
import type {ClientType} from "../../core/Atomic.ts";
import type {CommonClientConfig, NowPlayingOptions, UpstreamRefreshOptions} from "../common/infrastructure/config/client/index.ts";
import { TRANSFORM_HOOK } from "../../core/Transform.ts";
import type { Notifiers } from "../notifier/Notifiers.ts";
import {
    isDebugMode,
    parseBool,
    playObjDataMatch,
    pollingBackoff,
    sleep,
    sortByOldestPlayDate,
} from "../utils.ts";
import { findCauseByReference } from "../utils/ErrorUtils.ts";
import { messageWithCausesTruncatedDefault } from "../../core/ErrorUtils.ts";
import {
    comparePlayTemporally,
    hasAcceptableTemporalAccuracy,
} from "../utils/TimeUtils.ts";
import { todayAwareFormat } from "../../core/TimeUtils.ts";
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from "toad-scheduler";
import { getRoot } from "../ioc.ts";
import { staggerMapper, type StaggerOptions } from "../utils/AsyncUtils.ts";
import pMap, { pMapIterable } from "p-map";
import { existingScrobble, type ExistingScrobbleOpts } from "../utils/PlayComparisonUtils.ts";
import { statefulInvariantTransform } from "../../core/PlayUtils.ts";
import { normalizeStr } from "../utils/StringUtils.ts";
import type { Counter, Gauge } from 'prom-client';
import { generateLoggableAbortReason, ScrobbleSubmitError, SimpleError, StageChangeError } from "../common/errors/MSErrors.ts";
import { serializeError} from 'serialize-error';
import { DEFAULT_NEW_PADDING, groupPlaysToTimeRanges } from "../utils/ListenFetchUtils.ts";
import { spawn, isAbortError, delay, waitForEvent } from 'abort-controller-x';
import { DrizzlePlayRepository, playToRepositoryCreatePlayOpts, type QueryPlaysOpts, type WithPlayRelation } from "../common/database/drizzle/repositories/PlayRepository.ts";
import type {PlayEventNew, PlayEventSelect, PlaySelect, PlaySelectWithQueueStates, PlayWith, QueueStateSelect} from "../common/database/drizzle/drizzleTypes.ts";
import { asPlay } from "../../core/PlayMarshalUtils.ts";
import { DrizzleQueueRepository } from "../common/database/drizzle/repositories/QueueRepository.ts";
import { GenericRepository } from "../common/database/drizzle/repositories/BaseRepository.ts";
import assert from "node:assert";
import { COMPONENT_STATE, type ComponentClientApiJson, type PlayApiCommonDetailed, type QueueStateApi } from "../../core/Api.ts";
import type {ComponentState} from "react";
import { DrizzlePlayEventsRepository } from "../common/database/drizzle/repositories/PlayEventsRepository.ts";
import { PLAY_EVENT_TYPE, type PlayEvent } from "../../core/PlayEvent.ts";
import { dupeCheckToPlayEvent, entityIsPlayEntity, queueStateToPlayEvent, scrobbleToPlayEvent, stateChangeToPlayEvent, transformToPlayEvent } from "../common/database/drizzle/entityUtils.ts";
import type { PlayProcessingResult } from "../common/infrastructure/PlayProcessing.ts";
import { PlayProcessingError } from "../common/errors/PlayProcessingError.ts";

type SourceMappedPlayer = {player: SourcePlayerObj, source: SourceIdentifier};
type PlatformMappedPlays = Map<string, SourceMappedPlayer>;
type NowPlayingQueue = Map<string, PlatformMappedPlays>;

const platformTruncate = truncateStringToLength(10);

const noopTransform = async (x) => x;

const bufferNPUpdateReasonFragments: string[] = [
    'previous update play data does not match current',
    'player in valid update state',
    'less than min threshold'
];

export default abstract class AbstractScrobbleClient extends AbstractComponent implements Authenticatable {

    declare type: ClientType;

    scheduler: ToadScheduler = new ToadScheduler();
    protected initDeadTimeout: NodeJS.Timeout | undefined;

    protected MAX_STORED_SCROBBLES = 40;
    protected MAX_INITIAL_SCROBBLES_FETCH = this.MAX_STORED_SCROBBLES;

    preloadScrobbles: boolean = true;
    scrobbleSOTRanges: PaginatedTimeRangeOptions[] = [];
    tracksScrobbled: number = 0;
    tracksScrobbledTotal: number =  0;

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
    nowPlayingIsRealtime: boolean = false;
    nowPlayingInit: boolean = false;
    nowPlayingEnabled: boolean;
    nowPlayingFilter: (queue: NowPlayingQueue) => SourceMappedPlayer | undefined;
    nowPlayingMinThreshold: NowPlayingUpdateThreshold = (_) => 10;
    nowPlayingMaxThreshold: NowPlayingUpdateThreshold = (_) => 30;
    nowPlayingLastUpdated?: Dayjs;
    nowPlayingExpirationDate?: Dayjs;
    nowPlayingLastPlay?: SourcePlayerObj;
    nowPlayingQueue: NowPlayingQueue = new Map();
    nowPlayingTaskInterval: number = 5000;
    npLogger: Logger;
    dupeLogger: Logger;
    deadLogger: Logger;

    existingScrobble: (playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean) => Promise<PlayMatchResult>

    declare config: CommonClientConfig;

    notifier: Notifiers;

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

    public playRepo!: DrizzlePlayRepository;
    protected queueRepo!: DrizzleQueueRepository;
    protected playEventsRepo!: DrizzlePlayEventsRepository;
    protected migrationRepo!: GenericRepository<'componentMigrations'>;

    constructor(type: any, name: any, config: CommonClientConfig, emitter: EventEmitter, logger: Logger) {
        super(config);
        this.componentType = 'client';
        this.type = type;
        this.name = name;
        this.logger = childLogger(logger, this.getIdentifier());
        this.npLogger = childLogger(this.logger, 'Now Playing');
        this.dupeLogger = childLogger(this.logger, 'Dupe');
        this.deadLogger = childLogger(this.logger, DEAD_QUEUE);
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
            job.stop();
            this.scheduler.removeById(job.id);
        }
    }
    async [Symbol.asyncDispose]() {
        try {
            await this.stop({ reason: 'Instance is being destroyed' });
        } catch (e) {
            this.logger.warn(e);
        }
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
                        this.errors.push(err);
                        this.logger.error(err);
                    });
                },
                (err: Error) => {
                    this.errors.push(err);
                    this.logger.error(err);
                }
            ), {id: 'heartbeat'}));
        } else {
            this.logger.verbose('Heartbeat task is already added to scheduler, running immediately instead');
            const j = this.scheduler.getById('heartbeat') as SimpleIntervalJob;
            j.start();
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
                            return this.processDeadLetterQueue(undefined, 'Reprocessing bulk dead Plays by system').then(() => null).catch((e) => {
                                this.warnings = e;
                                this.logger.error(e);
                            })
                        }
                        return new Promise((resolve, reject) => resolve);
                    },
                    (err: Error) => {
                        this.warnings.push(err);
                        this.logger.error(err);
                    }
                ), {id: 'dead'}));
            }, deadDelay * 1000);

        } else {
            if(this.initDeadTimeout !== undefined) {
                this.logger.verbose('Dead scrobble task timeout is already set');
            } else {
                this.logger.verbose('Dead scrobble task is already added to the scheduler');
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
                await this.initialize({force: false, notify: true, notifyTitle: 'Could not initialize automatically'});
            } catch (e) {
                this.logger.error(new Error('Could not initialize automatically', {cause: e}));
                return false;
            }

            if(!this.canAuthUnattended()) {
                this.logger.warn({label: 'Heartbeat'}, 'Should be monitoring scrobbles but will not attempt to start because auth state is not good and cannot be correct unattended.');
                return false;
            }
        }
        if(this.isReady() && !this.scrobbling) {
            this.logger.info({labels: 'Heartbeat'}, 'Should be processing scrobbles! Attempting to restart scrobbling...');
            this.initScrobbleMonitoring().catch((e) => this.logger.error('Failed to initialize scrobbler monitoring during heartbeat'));
            return true;
        }
        return true;
    }

    public async start(opts: {forceInit?: boolean} = {}) {
        try {
            if (opts.forceInit) {
                if (!this.canAuthUnattended()) {
                    this.logger.warn({ labels: 'Heartbeat' }, 'Client is not ready but will not try to initialize because auth state is not good and cannot be corrected unattended.')
                    return false;
                }
                try {
                    await this.initialize({ force: true, notify: true, notifyTitle: 'Could not initialize automatically' });
                } catch (e) {
                    this.logger.error(new Error('Could not initialize automatically', { cause: e }));
                    return false;
                }

                if (!this.canAuthUnattended()) {
                    this.logger.warn({ label: 'Heartbeat' }, 'Should be monitoring scrobbles but will not attempt to start because auth state is not good and cannot be correct unattended.');
                    return false;
                }
            }
            this.initTasks();
            return true;
        } catch (e) {
            throw new StageChangeError('Failed to start', { cause: e });
        } finally {
            this.emitComponentUpdate<Partial<ComponentClientApiJson>>({ state: this.getRunningState() });
        }
    }

    public async stop(opts: { reason?: string | Error } = {}) {
        try {
            this.scheduler.stop();
            for (const job of this.scheduler.getAllJobs()) {
                job.stop();
                this.scheduler.removeById(job.id);
            }
            await this.tryStopScrobbling(opts.reason);
            await this.tryStopDeadProcessing(opts.reason);
            this.nowPlayingLastPlay = undefined;
            this.nowPlayingLastUpdated = undefined;
            this.setStatus('Stopped');
            this.emitComponentUpdate<Partial<ComponentClientApiJson>>({state: COMPONENT_STATE.STOPPED});
        } catch (e) {
            this.emitComponentUpdate<Partial<ComponentClientApiJson>>({state: this.getRunningState()});
            throw new StageChangeError('Failed to stop Client', { cause: e });
        }
    }

    protected async postCache(): Promise<void> {
        await super.postCache();
        this.generateStaggerMappers();
    }

    protected async postDatabase(): Promise<void> {
        this.playRepo = new DrizzlePlayRepository(this.db, {logger: this.logger});
        this.queueRepo = new DrizzleQueueRepository(this.db, {logger: this.logger});
        this.playEventsRepo = new DrizzlePlayEventsRepository(this.db, {logger: this.logger});
        this.migrationRepo = new GenericRepository<'componentMigrations'>(this.db, 'componentMigrations', 'Component Migrations', {logger: this.logger});
        this.playRepo.componentId = this.dbComponent.id;
        this.queueRepo.componentId = this.dbComponent.id;
        const counts = await this.playRepo.getComponentPlayCountByState();
        const scrobbledCount = counts.find(x => x.state === 'scrobbled');
        if(scrobbledCount !== undefined) {
            this.tracksScrobbledTotal = scrobbledCount['count(*)'];
        }
        await this.updateQueueStats([INGRESS_QUEUE, DEAD_QUEUE]);
    }

    protected async updateQueueStats(queueNames: string[]) {
        if(queueNames.includes(INGRESS_QUEUE)) {
            this.queuedLength = await this.queueRepo.getQueueCount(this.dbComponent.id, [INGRESS_QUEUE], {retries: 0});
            this.queuedGauge.labels(this.getPrometheusLabels()).set(this.queuedLength);
        }
        if(queueNames.includes(DEAD_QUEUE)) {
            this.deadLetterLength = await this.queueRepo.getQueueCount(this.dbComponent.id, [INGRESS_QUEUE], {queueStatus: ['failed','queued'], retries: 1, retryEq: 'gte'});
            this.deadLetterQueued = await this.queueRepo.getQueueCount(this.dbComponent.id, [INGRESS_QUEUE], {queueStatus: ['queued'], retries: 1, retryEq: 'gte'});
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
            const pcInits: number[] = [0],
            pcMaxStagger: number[] = [];
            for(const hook of preCompare) {
                const t = this.transformManager.getTransformerByStage({type: hook.type, name: hook.name});
                pcInits.push(t.staggerOpts?.initialInterval ?? 0);
                pcMaxStagger.push(t.staggerOpts?.maxRandomStagger ?? 0)
            }
            this.staggerMappers.preCompare = staggerMapper<PlayObject, PlayObject>({initialInterval: Math.max(...pcInits), maxRandomStagger: Math.max(...pcMaxStagger), concurrency: 3});
        }

        if(existing.length > 0) {
            const eInits: number[] = [0],
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

    public getRunningState(): ComponentState {
        if(this.scrobbleQueuePromise === undefined) {
            return COMPONENT_STATE.IDLE;
        }
        if(this.scrobbling && !this.isMonitoring()) {
            return COMPONENT_STATE.IGNORED;
        }
        return COMPONENT_STATE.RUNNING;
    }

    protected getComponentApiData() {
        return {
            authType: this.authType,
            initialized: this.initializedOnce,
            hasAuth: this.requiresAuth,
            hasAuthInteraction: this.requiresAuthInteraction,
            authed: this.authed,
        }
    }

    public getApiData(): ComponentClientApiJson {
        return {
            ...super.getApiData(),
            ...this.getComponentApiData(),
            type: this.type,
            status: this.status,
            queued: this.queuedLength,
            tracksScrobbled: this.tracksScrobbled,
            countLive: this.tracksScrobbledTotal,
            deadLetterPlays: this.deadLetterQueued,
            deadLetterPlaysTotal: this.deadLetterLength,
            supportsNowPlaying: this.supportsNowPlaying,
            players: {...this.getNowPlayingPlayers()}
        }
    }

    public getNowPlayingPlayers(): Record<string, SourcePlayerJson & {expiration?: string}> {
        if(this.nowPlayingLastPlay === undefined 
            || (this.nowPlayingIsRealtime && shouldClearNPStatus(this.nowPlayingLastPlay))
            || (!this.nowPlayingIsRealtime && [CALCULATED_PLAYER_STATUSES.stale,CALCULATED_PLAYER_STATUSES.orphaned].includes(this.nowPlayingLastPlay.status.calculated as ReportedPlayerStatus))) {
            return {};
        }
        return {
            [this.nowPlayingLastPlay.platformId]: {...(this.nowPlayingLastPlay as unknown as SourcePlayerJson), expiration: !this.nowPlayingIsRealtime ? this.nowPlayingExpirationDate?.toISOString() : undefined }
        }
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
                const npErr = new Error('Unexpected error while processing Now Playing queue', {cause: err});
                this.npLogger.error(npErr);
                this.warnings.push(npErr);
                this.emitComponentUpdate<Partial<ComponentClientApiJson>>({warnings: this.warnings});
            });

            // even though we are processing every 5 seconds the interval that Now Playing is updated at, and that the queue is cleared on,
            // is still set by shouldUpdatePlayingNow()
            // 5 seconds makes sure our granularity for updates is decently fast *when* we do need to actually update
            this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({milliseconds: this.nowPlayingTaskInterval}, t, {id: 'pn_task'}));
        } else {
            this.logger.verbose('Now Playing task already added to scheduler');
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

            this.nowPlayingFilter = (queue: NowPlayingQueue): SourceMappedPlayer => {
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
                    return plays[0][1];
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
                            return data;
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
                preferredPlays.sort((a, b) => a[0].localeCompare(b[0]));
                return preferredPlays[0][1];
            }
        }
    }

    protected async postInitialize(): Promise<void> {
        super.postInitialize();
        const {
            options: {
                refreshInitialCount = this.MAX_INITIAL_SCROBBLES_FETCH
            } = {},
            options = {},
        } = this.config;

        this.initializeNowPlaying();

        if(this.preloadScrobbles) {
            let initialLimit = refreshInitialCount;
            if (refreshInitialCount > this.MAX_INITIAL_SCROBBLES_FETCH) {
                this.logger.warn(`Defined initial scrobbles count (${refreshInitialCount}) higher than maximum allowed (${this.MAX_INITIAL_SCROBBLES_FETCH}). Will use max instead.`);
                initialLimit = this.MAX_INITIAL_SCROBBLES_FETCH;
            }

            this.logger.verbose(`Preloading up to ${initialLimit} initial scrobbles...`);
            this.setStatus(`Preloading up to ${initialLimit} initial scrobbles...`);

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
                        this.setStatus(`Preloaded 0 scrobbles.`);
                    } else {
                        preload.sort(sortByOldestPlayDate);
                        const from = preload[0].data.playDate;
                        // we are assuming that all fetchers return latest scrobbles first (pretty sure this is the case)
                        const to = dayjs();// preload[preload.length - 1].data.playDate;
                        await this.cache.cacheClientScrobbles.set<PlayObject[]>(this.getScrobbleCacheKey(from, to), preload, '60s');
                        this.scrobbleSOTRanges.push({from: from.unix(), to: to.unix()});
                        this.logger.verbose(`Preloaded ${preload.length} scrobbles from ${todayAwareFormat(from)} to ${todayAwareFormat(to)}`);
                        this.setStatus(`Preloaded ${preload.length} scrobbles`);
                    }
                }
            } catch (e) {
                const preloadErr = new SimpleError('Could not preload scrobbles', {cause: e, shortStack: true});
                this.warnings.push(preloadErr);
                this.emitComponentUpdate<Partial<ComponentClientApiJson>>({warnings: this.warnings});
                this.logger.warn(preloadErr);
            }
        }
    }

    abstract getScrobblesForTimeRange: TimeRangeListensFetcher;

    protected getScrobbleCacheKey = (from: Dayjs | number, to: Dayjs | number): string => {
        return `${this.name}-scrobbleRange-${typeof from === 'number' ? from : from.unix()}-${typeof to === 'number' ? to :to.unix()}`;
    }

    handleQueuedScrobbleRanges = async (deadRetries: number = 3) => {
            const queued = await this.playRepo.getQueuedScrobbleRange(INGRESS_QUEUE);
            const dead = await this.playRepo.getQueuedScrobbleRange(DEAD_QUEUE, {retries: deadRetries});
            this.scrobbleSOTRanges = groupPlaysToTimeRanges(queued.concat(dead), this.scrobbleSOTRanges, {staleNowBuffer: this.config.options?.refreshStaleAfter});
    }

    async getSOTScrobblesForPlay(play: PlayObject, opts: {useCache?: boolean} = {}): Promise<PlayObject[]> {
        const {useCache = true} = opts;
        let range: PaginatedTimeRangeOptions = this.scrobbleSOTRanges.find(x => x.from <= play.data.playDate.unix() && x.to > Math.min(dayjs().subtract(this.config.options?.refreshStaleAfter ?? REFRESH_STALE_DEFAULT, 's').unix(), play.data.playDate.unix()));
        if(range === undefined) {
            this.logger.warn(`No Scrobble SOT range found! Should have been handled before this. Creating a new one for ${buildTrackString(play)}`);
            range = {
                from: play.data.playDate.subtract(DEFAULT_NEW_PADDING).unix(), 
                to: Math.min(play.data.playDate.add(DEFAULT_NEW_PADDING).unix(), dayjs().subtract(this.config.options?.refreshStaleAfter ?? REFRESH_STALE_DEFAULT, 's').unix()) 
            };
            this.scrobbleSOTRanges.push(range);
        }
        if(range.from === range.to) {
            // most apis don't allow same to/from
            // and this *probably* means we only have one play in recent history
            // so expand this with default padding to be safe
            range.from = range.from - DEFAULT_NEW_PADDING.asSeconds();
            range.to = Math.min(dayjs().unix(), range.to + 30) // 30 seconds after "to", or now
        }
        const cachedPlaysRes = useCache ? await this.cache.cacheClientScrobbles.get<PlayObject[] | Error>(this.getScrobbleCacheKey(range.from, range.to)) : undefined;
        if(cachedPlaysRes instanceof Error) {
            throw new SimpleError('Cannot get historical plays due to cached error', {cause: cachedPlaysRes, shortStack: true});
        }
        if(cachedPlaysRes !== undefined) {
            return cachedPlaysRes;
        }
        try {
            const plays = (await this.getScrobblesForTimeRange(range)).map(x => ({...x, meta: {...x.meta, parsedFrom: PARSED_FROM.history}}));
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
        this.tracksScrobbledTotal++;
    }

    findExistingSubmittedPlayObj = async (playObjPre: PlayObject): Promise<([undefined, undefined] | [ScrobbledPlayObject, ScrobbledPlayObject[]])> => {

        const playObj = await this.transformPlay(playObjPre, TRANSFORM_HOOK.candidate);

        if(this.transformRules.compare?.existing === undefined) {
            // if no existing transform then we can run cheap db match
            const cheapExisting = await this.playRepo.checkExisting(playObj, {states: ['scrobbled'], notId: playObjPre.id});
            if(cheapExisting !== undefined) {
                const s: ScrobbledPlayObject = {play: cheapExisting.play, scrobble: cheapExisting.play.scrobble?.mergedScrobble};
                return [s, [s]];
            }
        }

        const closeTemporalPlays = await this.playRepo.getTemporallyClosePlays(playObj, {states: ['scrobbled'], notId: playObjPre.id});

        const dtInvariantMatches = (await pMap(closeTemporalPlays.map(x => x.play), this.staggerMappers.existing(async x => (await this.transformPlay(x, TRANSFORM_HOOK.existing))), {concurrency: 3}))
            .filter(x => playObjDataMatch(playObj, x));

        if (dtInvariantMatches.length === 0) {
            return [undefined, []];
        }

        const matchPlayDate = dtInvariantMatches.find((x: PlayObject) => {
            const temporalComparison = comparePlayTemporally(x, playObj, {logger: this.logger});
            return hasAcceptableTemporalAccuracy(temporalComparison.match)
        });

        const s: ScrobbledPlayObject = {play: matchPlayDate, scrobble: matchPlayDate.scrobble?.mergedScrobble};

        return [s, [s]];
    }

    public async scrobble(playObj: PlayObject, opts?: { delay?: number | false, signal?: AbortSignal }): Promise<PlayObject> {
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
            this.setStatus(`Scrobbling Play ${playObj.uid}`);
            const result = await this.doScrobble(playObj);
            const {
                scrobble = {}
            } = playObj;
            playObj.scrobble = {
                ...scrobble,
                payload: result.payload,
                warnings: result.warnings,
                createdAt: dayjs(),
                response: result.response,
                mergedScrobble: result.mergedScrobble !== undefined ? statefulInvariantTransform(result.mergedScrobble) : undefined
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
                await this.initialize(options);
            } catch (e) {
                this.logger.error(new Error('Cannot start monitoring because Client is not ready', {cause: e}));
                if(notify) {
                    await this.notify( {title: `Processing Error`, message: `Cannot start monitoring because Client is not ready: ${truncateStringToLength(500)(messageWithCausesTruncatedDefault(e))}`, priority: 'error'});
                }
                return;
            }
        }
        this.setStatus('Starting scrobbling processing');
        this.scrobbleQueueAbortController = new AbortController();
        this.scrobbleQueuePromise = spawn(this.scrobbleQueueAbortController.signal, async (signal, { defer, fork }) => {

            defer(async () => {
                this.scrobbling = false;
                this.emitEvent('statusChange', {status: 'Idle'});
                this.emitComponentUpdate<Partial<ComponentClientApiJson>>({state: COMPONENT_STATE.IDLE});
            });

            await this.startScrobbling(signal);
        }).catch((e) => {
            const componentUpdate: Partial<ComponentClientApiJson> = {
                state: COMPONENT_STATE.IDLE
            };
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Scrobble processing stopped', this.scrobbleQueueAbortController.signal);
                this.logger.info(err);
                //this.logger.trace(e);
                componentUpdate.status = 'Processing cancelled';
            } else {
                const err = new Error('Scrobble processing stopped with error', { cause: e });
                this.logger.warn(err);
                componentUpdate.status = 'Processing stopped with error';
                this.warnings.push(err);
                componentUpdate.warnings = this.warnings;
            }
            this.emitComponentUpdate<Partial<ComponentClientApiJson>>(componentUpdate);
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

        if(this.scrobbling === true) {
            this.logger.warn(`Already scrobble processing! Processing needs to be stopped before it can be started`);
            return;
        }

        // can't have negative retries!
        const maxRetries = Math.max(0, maxRequestRetries);

        while (this.scrobbleRetries <= maxRetries) {
            try {
                await this.doProcessing(signal);
            } catch (e) {
                if(isAbortError(e)) {
                    throw e;
                }
                if(!this.isUsable()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer usable.');
                    await this.notify({title: `Processing Error`, message: `Encountered error while scrobble processing and client is no longer usable, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    throw e;
                }
                if (this.authGated()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer being authenticated.');
                    await this.notify({title: ` Processing Error`, message: `Encountered error while scrobble processing and client is no longer authenticated, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    throw e;
                }
                if (this.scrobbleRetries < maxRetries) {
                    const delayFor = pollingBackoff(this.scrobbleRetries + 1, retryMultiplier);
                    this.logger.info(`Scrobble processing retries (${this.scrobbleRetries}) less than max processing retries (${maxRetries}), restarting processing after ${delayFor} second delay...`);
                    await this.notify({title: `Processing Retry`, message: `Encountered error while polling but retries (${this.scrobbleRetries}) are less than max poll retries (${maxRetries}), restarting processing after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Scrobble processing retries (${this.scrobbleRetries}) equal to max processing retries (${maxRetries}), stopping processing!`);
                    await this.notify({title: `Processing Error`, message: `Encountered error while scrobble processing and retries (${this.scrobbleRetries}) are equal to max processing retries (${maxRetries}), stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    throw e;
                }
                this.scrobbleRetries++;
            }
        }
    }

    tryStopScrobbling = async (reason?: string | Error) => {
        if(this.scrobbling === false) {
            this.logger.verbose(`Polling is already stopped!`);
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
            throw new Error('Could not stop scrobble processing! Or signal was lost');
        }
        return true;
    }

    tryStopDeadProcessing = async (reason?: string | Error) => {
        if(this.deadQueueProcessing === false) {
            this.logger.verbose(`Dead queue processing is already stopped`);
            return;
        }
        if(this.deadQueueAbortController === undefined) {
            this.logger.error('No abort controller found! Nothing to stop.');
            return false;
        }
        this.deadQueueAbortController.abort(reason)
        let timePasssed = 0;
        while(this.deadQueueProcessing === true && timePasssed < (this.scrobbleWaitStopInterval * 10)) {
            await sleep(this.scrobbleWaitStopInterval);
            timePasssed += this.scrobbleWaitStopInterval;
            this.logger.verbose(`Waiting for dead queue processing stop signal to be acknowledged (waited ${timePasssed}ms)`);
        }
        if(this.deadQueueProcessing === true) {
            throw new Error('Could not stop dead queue processing! Or signal was lost');
        }
        return true;
    }

    protected doProcessing = async (signal: AbortSignal): Promise<true | undefined> => {
        signal.throwIfAborted();
        this.logger.info('Scrobble processing started');
        this.emitEvent('statusChange', {status: 'Running'});
        this.emitComponentUpdate<Partial<ComponentClientApiJson>>({state: COMPONENT_STATE.RUNNING});

        try {
            this.setStatus('Waiting for Plays from Sources');
            this.scrobbling = true;
            if(!this.upstreamRefresh.refreshEnabled) {
                this.logger.verbose('Scrobble refresh is DISABLED. All queued scrobbles will likely always be scrobbled (nothing to check duplicates against).');
            }
            while (true) {
                signal.throwIfAborted();
                //let queueEmpty = await this.playRepo.hasQueueNext(CLIENT_INGRESS_QUEUE); // this.queuedLength; // this.queuedScrobbles.length === 0;
                let nextQueued = await this.playRepo.getQueueNext(INGRESS_QUEUE);
                if(nextQueued !== undefined) {
                    while (nextQueued !== undefined) {
                        await this.handlePlayProcessing(nextQueued, signal);
                        if(this.errors.length > 0) {
                            // we made it through a scrobble without any issues so clear any issue we may have previously had
                            this.errors = [];
                            this.emitComponentUpdate<Partial<ComponentClientApiJson>>({errors: []});
                        }
                        nextQueued = await this.playRepo.getQueueNext(INGRESS_QUEUE)
                    }
                    this.emitEvent('queueEmptied', {});
                    this.setStatus('Waiting for Plays from Sources');
                }
                this.updateDates({lastActiveAt: dayjs(), lastReadyAt: dayjs()});
                await delay(signal, this.scrobbleSleep);
            }
        } catch (e) {
            if(!isAbortError(e)) {
                this.logger.error('Scrobble processing interrupted');
                this.logger.error(e);
            }
            this.emitEvent('statusChange', {status: 'Idle'});
            this.emitComponentUpdate<Partial<ComponentClientApiJson>>({state: COMPONENT_STATE.IDLE});
            this.scrobbling = false;
            throw e;
        }
    }

    protected handlePlayProcessing = async (playEntity: PlaySelectWithQueueStates, signal?: AbortSignal) => {
        let res: PlayProcessingResult,
        err: Error;
        try {
            res = await this.processPlay(playEntity, signal);
        } catch (e: unknown | Error | PlayProcessingError) {
            if(isAbortError(e)) {
                err = generateLoggableAbortReason('Interrupted by abort signal', this.scrobbleQueueAbortController.signal);
                throw e;
            }
            if(e instanceof PlayProcessingError) {
                err = e.cause as Error;
                res = e.result;
                if(e.showStopping) {
                    throw e.cause;
                }
            } else {
                const unhandledError = new Error('Unhandled error type while processing Play', {cause: e});
                if(e instanceof Error) {
                    err = e;
                } else {
                    err = unhandledError;
                }
                throw e;
            }
        } finally {
            let queueStates: QueueStateSelect[];
            const initialRetries = res.queue.retries ?? 0;
            if(err !== undefined) {
                res.queue.retries = (initialRetries + 1);
                res.queue.updatedAt = dayjs();
                await this.queueRepo.updateById(res.queue.id, {
                    ...res.queue,
                });
                if(initialRetries === 0) {
                    this.deadLetterGauge.labels(this.getPrometheusLabels()).inc();
                    this.deadLetterLength += 1;
                    this.deadLetterQueued += 1;
                    this.emitEvent('deadLetter', res.playEntity);
                }
                queueStates = res.playEntity.queueStates.filter(x => x.queueName !== res.queue.queueName).concat([res.queue]);
            } else {
                await this.queueRepo.deleteByIds([res.queue.id]);
                if(res.queue.retries > 0) {
                    this.deadLetterGauge.labels(this.getPrometheusLabels()).dec();
                    this.deadLetterLength -= 1;
                    this.deadLetterQueued -= 1;
                    this.emitEvent('removeDeadLetter', { dead: { id: res.playEntity.uid } });
                }
                queueStates = res.playEntity.queueStates.filter(x => x.queueName !== res.queue.queueName)
            }
            if(initialRetries === 0) {
                this.queuedGauge.labels(this.getPrometheusLabels()).dec();
                this.queuedLength -= 1;
                this.emitEvent('playDequeued', { queuedScrobble: playEntity });
            } else {
                this.emitEvent('deadLetterDequeued', res.playEntity);
                this.deadLetterQueued -= 1;
            }
            this.playRepo.updateById(playEntity.id, {play: res.playEntity.play, state: res.playEntity.state, error: res.playEntity.error});
            const createdEvents = await this.playEventsRepo.createMany(res.events.map(x => ({...x, playId: playEntity.id}))) as PlayEventSelect[];
            this.emitPlayUpdate({
                ...res.playEntity, 
                events: ((res.playEntity as unknown as PlayWith<'events'>).events ?? []).concat(createdEvents),
                queueStates
            } as unknown as PlayApiCommonDetailed);
        }
    }

    protected getDefaultDeadLetterRetries() {
        return this.config.options?.deadLetterRetries ?? DEAD_LETTER_RETRIES_DEFAULT;
    }

    processDeadLetterQueue = async (attemptWithRetries?: number, reason?: string, sync?: boolean) => {

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

        this.deadQueueAbortController = new AbortController();
        this.deadQueuePromise = spawn(this.deadQueueAbortController.signal, async (signal, { defer, fork }) => {

            defer(async () => {
                this.deadQueueProcessing = false;
                this.emitEvent('queueState', {queueName: 'dead', status: 'Idle'});
            });

            this.emitEvent('queueState', {queueName: 'dead', status: 'Running'});

            //const processable = await this.queueRepo.getQueueCount(this.dbComponent.id, [INGRESS_QUEUE], [QUEUE_STATUS_FAILED], retries);
            const processableArgs: QueryPlaysOpts  = {queues: [{queueName: INGRESS_QUEUE, queueStatus: QUEUE_STATUS_FAILED, retries}], with: ['queues']};
            let processable = await this.playRepo.findPlaysPaginated(processableArgs);
            this.deadLetterQueued = processable.meta.total;

            const total = await this.queueRepo.getQueueCount(this.dbComponent.id, [INGRESS_QUEUE], {queueStatus: [QUEUE_STATUS_FAILED], retries: 10000});
            this.deadLetterLength = total;
            const queueStatus = `${processable.meta.total} of ${total} dead scrobbles have less than ${retries} retries, ${processable.meta.total === 0 ? 'will skip processing.': 'processing now...'}`;
            if (processable.meta.total === 0) {
                this.deadLogger.verbose(queueStatus);
                return;
            }
            this.setStatus(`Queuing ${processable} Dead Plays...`);
            this.logger.info(queueStatus);
            let more = true;
            let offset = 0;
            while(more) {
                await this.queueScrobble(processable.data, {reason});
                more = processable.data.length === processable.meta.limit;
                if(more) {
                    offset += processable.meta.limit;
                    processable = await this.playRepo.findPlaysPaginated({...processableArgs, offset});
                }
            }
            this.setStatus(`All processable Dead Plays have been queued`);
            this.logger.info(`All processable Dead Plays have been queued`);

            if(sync) {
                await waitForEvent(signal,this.emitter,'queueEmptied');
                this.setStatus(`Finished processing Dead Plays`);
                this.logger.info('Finished processing Dead Plays');
            }
        }).catch((e) => {
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Dead scrobble processing stopped', this.deadQueueAbortController.signal);
                this.logger.info(err);
                this.logger.trace(e)
            } else {
                this.logger.warn(new Error('Dead scrobble processing stopped with error', { cause: e }));
            }
        }).finally(() => {
            this.deadQueueAbortController = undefined;
            this.deadQueuePromise = undefined;
        });
    }

    processPlay = async (playEntity: PlaySelectWithQueueStates, signal?: AbortSignal): Promise<PlayProcessingResult> => {
        signal?.throwIfAborted();

        const queueState = playEntity.queueStates.find(x => x.queueName === INGRESS_QUEUE);
        const {
            context,
        } = queueState
        const {
            useCache = true,
            isRetry = false,
            transform = true,
            dupeCheck = true,
        } = context || {};

        const isDead = queueState.retries > 0 || isRetry;

        const logger = isDead ? childLogger(this.logger, ['Dead', `Play ${playEntity.uid}`]) : childLogger(this.logger, [`Play ${playEntity.uid}`]);
        this.setStatus(`Processing ${isDead ? 'Dead ' : ''}Play ${playEntity.uid}`);

        let processError: Error | undefined;
        const events: Omit<PlayEvent, 'playId'>[] = [];

        try {
            if (!isRetry && !playEntity.play.meta.wasMonitored) {
                this.logger.debug(`Not processing ${buildTrackString(playEntity.play)} because monitoring was disabled when Play was queued.`);
                events.push(stateChangeToPlayEvent({ state: 'discarded', reason: 'Monitoring was disabled when Play was queued' }));
                events.push(queueStateToPlayEvent({...queueState, context: undefined, queueStatus: 'completed'}));
                playEntity.state = 'discarded';
                return {playEntity, queue: queueState, events};
            }

            let historicalPlays: PlayObject[] = [];

            if (dupeCheck && this.upstreamRefresh.refreshEnabled) {
                await this.handleQueuedScrobbleRanges();
                try {
                    historicalPlays = await this.getSOTScrobblesForPlay(playEntity.play, {useCache: !(isRetry || !useCache)});
                } catch (e) {

                    if (e.message === 'Cannot get historical plays due to cached error') {
                        logger.warn(`${buildTrackString(playEntity.play)} from Source '${playEntity.play.meta.source}' => Previous error while getting historical scrobbles means this scrobble cannot be compared, will queue as dead for now.`);
                        logger.trace(e);
                        processError = e;
                    } else {
                        processError = new SimpleError(`${buildTrackString(playEntity.play)} from Source '${playEntity.play.meta.source}' => cannot get historical scrobbles, will queue as dead for now.`, { cause: e, shortStack: true });
                        logger.warn(processError);
                    }
                    playEntity.state = 'failed';
                    events.push(stateChangeToPlayEvent({state: 'failed'}));
                    queueState.queueStatus = QUEUE_STATUS_FAILED;
                    queueState.error = processError;
                    events.push(queueStateToPlayEvent({...queueState, context: undefined,}));
                    throw new PlayProcessingError(processError, {playEntity, events, queue: queueState, showStopping: false});
                    //deadQueueEntity = await this.addDeadLetterScrobble(playEntity, e);
                }
                signal.throwIfAborted();
            }

            let isDupe = false;
            if(dupeCheck) {
                const { summary, ...matchResult } = await this.existingScrobble({...playEntity.play, id: playEntity.id, uid: playEntity.uid}, historicalPlays);
                events.push(dupeCheckToPlayEvent({ summary, ...matchResult, createdAt: dayjs().toISOString() }));
                isDupe = matchResult.match;
            }

            signal.throwIfAborted();
            if (!isDupe) {
                const transformedScrobble = transform ? await this.transformPlay(playEntity.play, TRANSFORM_HOOK.postCompare, {useCachedResult: useCache}) : playEntity.play;
                const { lifecycle = [], ...restPlay } = transformedScrobble;
                playEntity.play = restPlay;
                const psLifecycle = lifecycle.filter(x => x.hook === TRANSFORM_HOOK.postCompare);
                if (psLifecycle.length > 0) {
                    events.push({ ...transformToPlayEvent(psLifecycle), createdAt: dayjs() });
                }
                signal.throwIfAborted();
                try {
                    const scrobbledPlay = await this.scrobble(transformedScrobble, { signal });
                    const { scrobble } = scrobbledPlay;
                    events.push(scrobbleToPlayEvent(scrobble));
                    //currQueuedPlay.play = scrobbledPlay;
                    await this.addScrobbledTrack(scrobbledPlay);
                    events.push(stateChangeToPlayEvent({state: 'scrobbled'}));
                    events.push(queueStateToPlayEvent({...queueState, context: undefined, queueStatus: QUEUE_STATUS_COMPLETED}));
                    this.scrobbleRetries = 0;
                    playEntity.state = 'scrobbled';
                    playEntity.error = undefined;
                    return {playEntity, events, queue: queueState};
                } catch (e) {
                    const scrobbleRes: ScrobbleResult = {
                        createdAt: dayjs()
                    }

                    const submitError = findCauseByReference(e, ScrobbleSubmitError);
                    if (submitError !== undefined) {
                        scrobbleRes.payload = submitError.payload;
                        scrobbleRes.response = submitError.responseBody;
                        scrobbleRes.error = serializeError(submitError);
                    } else {
                        scrobbleRes.payload = this.playToClientPayload(transformedScrobble);
                        scrobbleRes.error = serializeError(e);
                    }
                    events.push(scrobbleToPlayEvent(scrobbleRes));
                    playEntity.state = 'failed';
                    events.push(stateChangeToPlayEvent({state: 'failed'}));
                    queueState.queueStatus = QUEUE_STATUS_FAILED;
                    if (hasUpstreamError(e, false)) {
                        //handledShiftedPlay = true;
                        const nonShowStoppingError = new Error(`Could not scrobble but error was not show stopping. May be retried automatically in Dead Queue`, { cause: e });
                        events.push(queueStateToPlayEvent({...queueState, context: undefined, queueStatus: QUEUE_STATUS_FAILED, error: nonShowStoppingError}));
                        queueState.error = nonShowStoppingError;
                        logger.warn(nonShowStoppingError);
                        processError = nonShowStoppingError;
                        throw new PlayProcessingError(nonShowStoppingError, {playEntity, queue: queueState, events, showStopping: false});
                    } else {
                        //this.queuedScrobbles.unshift(currQueuedPlay);
                        //handledShiftedPlay = true;
                        const showStoppingError = new Error('Error occurred while trying to scrobble', { cause: e });
                        events.push(queueStateToPlayEvent({...queueState, context: undefined, queueStatus: QUEUE_STATUS_FAILED, error: showStoppingError}));
                        queueState.error = showStoppingError;
                        processError = showStoppingError;
                        throw new PlayProcessingError(showStoppingError, {playEntity, queue: queueState, events, showStopping: true});
                    }
                }
            } else {
                this.setStatus(`Play ${playEntity.id} detected as dupe`);
                this.scrobbleRetries =  0;
                playEntity.state = 'duped';
                events.push(stateChangeToPlayEvent({state: 'duped'}));
                events.push(queueStateToPlayEvent({...queueState, queueStatus: QUEUE_STATUS_COMPLETED}));
                return {playEntity, events, queue: queueState};
            }
        } catch (e) {
            if(e instanceof PlayProcessingError) {
                throw e;
            }
            if(isAbortError(e)) {
                events.push(stateChangeToPlayEvent({state: 'failed'}));
                events.push(queueStateToPlayEvent({...queueState, queueStatus: QUEUE_STATUS_FAILED, error: generateLoggableAbortReason('Interrupted by abort signal', this.scrobbleQueueAbortController.signal)}));
                throw e;
            }
            if(!events.some(x => x.eventName === PLAY_EVENT_TYPE.playStateChange)) {
                events.push(stateChangeToPlayEvent({state: 'failed'}));
                playEntity.state = 'failed';
            }
            if(!events.some(x => x.eventName === PLAY_EVENT_TYPE.queueStateChange)) {
                events.push(queueStateToPlayEvent({...queueState, queueStatus: QUEUE_STATUS_FAILED, error: e}));
            }
            throw new PlayProcessingError(e, {playEntity, queue: queueState, events, showStopping: true});
        }
    }

    removeDeadLetterScrobble = async (dead: PlaySelectWithQueueStates) => {

        const queueState = dead.queueStates.find(x => x.queueName === INGRESS_QUEUE);
        if(queueState === undefined) {
            this.logger.warn(`Play ${dead.uid} does not have a dead state, nothing to remove.`);
            return;
        }
        if(queueState.retries === 0) {
            this.logger.warn(`Play ${dead.uid} has not failed yet, not removing.`);
            return;
        }

        this.setStatus(`Marking Dead Play ${dead.uid} as completed`);

        const events: PlayEventNew[] = [
            { playId: dead.id, ...queueStateToPlayEvent({...queueState, queueStatus: QUEUE_STATUS_COMPLETED, context: {reason: 'Dead Play marked as completed by user'}}) }
        ];
        await this.queueRepo.deleteByIds([queueState.id]);
        
        if(dead.state === 'queued') {
            dead.state = 'failed';
            this.playRepo.updateById(dead.id, {state: 'failed'});
            events.push(
                { playId: dead.id, ...stateChangeToPlayEvent({ state: 'failed' }) }
            )
        }
        const createdEvents = await this.playEventsRepo.createMany(events) as PlayEventSelect[];
        this.emitPlayUpdate({uid: dead.uid,
             state: dead.state,
             queueStates: dead.queueStates.filter(x => x.queueName !== INGRESS_QUEUE) as unknown as QueueStateApi[],
             events: createdEvents as unknown as PlayEvent<string>[]
        });

        this.deadLetterLength -= 1;
        if(queueState.queueStatus === 'queued') {
            this.deadLetterQueued -= 1;
        }
        this.deadLetterGauge.labels(this.getPrometheusLabels()).dec();
        this.emitEvent('removeDeadLetter', { dead: { id: dead.uid } });
    }

    removeDeadLetterScrobbles = async () => {
        const ids = await this.playRepo.findPlayIdentifiers({
            queues: [
                {
                    queueName: INGRESS_QUEUE,
                    queueStatus: 'failed'
                }
            ]
        }, 'id');
        this.deadLogger.info(`Marking ${ids.length} as completed...`);
        await pMap(ids, async (id) => {
            const entity = await this.playRepo.findByIdWith<'queueStates'>(id, ['queues']);
            if(entity !== undefined) {
                await this.removeDeadLetterScrobble(entity);
            }
        }, {concurrency: 10});
        this.deadLogger.info('Finished processing dead scrobbles.');
        await this.updateQueueStats([DEAD_QUEUE]);
    }

    public cancelQueuedPlay = async (playEntity: PlaySelectWithQueueStates) => {
        const queueState = playEntity.queueStates.find(x => x.queueName === INGRESS_QUEUE);
        if(queueState === undefined) {
            throw new SimpleError('Play does not have an associated queued');
        }
        if(queueState.queueStatus !== 'queued') {
            throw new SimpleError('Play is not queued');
        }

        queueState.queueStatus = QUEUE_STATUS_FAILED;
        playEntity.state = 'failed';
        const createdEvents = await this.playEventsRepo.createMany([
            {playId: playEntity.id, ...stateChangeToPlayEvent({state: playEntity.state})},
            {playId: playEntity.id, ...queueStateToPlayEvent({...queueState, context: {reason: 'Cancelled by user'}})}
        ]) as PlayEventSelect[];
        await this.queueRepo.updateById(queueState.id, {queueStatus: QUEUE_STATUS_FAILED});
        await this.playRepo.updateById(playEntity.id, {state: 'failed'});
        this.emitPlayUpdate({
            ...playEntity, 
            events: ((playEntity as unknown as PlayWith<'events'>).events ?? []).concat(createdEvents),
        } as unknown as PlayApiCommonDetailed);
        if(queueState.retries === 0) {
            this.emitEvent('playDequeued', { queuedScrobble: playEntity });
        } else {
            this.emitEvent('deadLetterDequeued', { queuedScrobble: playEntity });
        }
    }

    queueScrobble = async (data: (PlayObject | PlayObject[]) | (PlaySelectWithQueueStates | PlaySelectWithQueueStates[]), context?: QueueContext & {isRetry?: boolean}) => {
        const createdQueuedPlays: PlaySelect[] = [];

        const dataArray = Array.isArray(data) ? data : [data];

        if (dataArray.every(x => entityIsPlayEntity(x))) {
            for (const playSelect of dataArray) {
                let queue = playSelect.queueStates.find(x => x.queueName === INGRESS_QUEUE);
                if (queue === undefined) {
                    queue = await this.queueRepo.create({ componentId: this.dbComponent.id, playId: playSelect.id, queueName: INGRESS_QUEUE, context }) as QueueStateSelect;
                } else {
                    this.queueRepo.updateById(queue.id, { queueStatus: 'queued', context });
                }
                const events = await this.playEventsRepo.createMany([
                    { playId: playSelect.id, ...stateChangeToPlayEvent({ state: 'queued' }) },
                    { playId: playSelect.id, ...queueStateToPlayEvent({ ...queue, context: context ?? queue.context }) }
                ]) as PlayEventSelect[];
                playSelect.state = 'queued';
                await this.playRepo.updateById(playSelect.id, {state: 'queued'});
                if (`events` in playSelect) {
                    (playSelect as PlayWith<'events'>).events = (playSelect as PlayWith<'events'>).events.concat(events);
                } else {
                    (playSelect as unknown as PlayWith<'events'>).events = events;
                }
                this.emitPlayUpdate({ ...playSelect } as unknown as PlayApiCommonDetailed);
                this.emitEvent(queue.retries > 0 ? 'deadQueued' : 'playQueued', {queuedPlay: playSelect});
                createdQueuedPlays.push(playSelect);
            }
        } else if (dataArray.every(x => isPlayObject(x))) {
            const monitoring = this.getMonitoringStatus();
            const {
                transform = true,
            } = context || {};
            const playDatas = dataArray.map(x => ({...x, meta: {...x.meta, wasMonitored: monitoring.monitoring, seenAt: dayjs()}}));

            for await(const play of pMapIterable(playDatas, this.staggerMappers.preCompare(async x => transform === false ? await noopTransform(x) : await this.transformPlay(x, TRANSFORM_HOOK.preCompare)), {concurrency: 3})) {
                try {
                    // cheap check, looks for play data (non-meta) hash, playdate, and optionally mbid recording
                    const cheapExisting = await this.playRepo.checkExisting(play, { queueName: INGRESS_QUEUE });
                    if (cheapExisting !== undefined) {
                        const qs = cheapExisting.queueStates.find(x => x.queueName === INGRESS_QUEUE);
                        this.logger.trace(`Not adding to queue because it is already in the queue, discovered via hash/mbid, last queued at ${todayAwareFormat(qs.createdAt)}`);
                        continue;
                    }
                    // then chunked queued plays
                    let offset = 0;
                    let inQueue = false;
                    while (true) {
                        const { data, meta } = await this.playRepo.getQueued(INGRESS_QUEUE, { offset, retries: 0 });
                        const existingQueued = await this.existingScrobble(play, data.map(x => asPlay(x.play)), false);
                        // want to be very confident of this
                        if (existingQueued.match && existingQueued.score > 0.99) {
                            this.logger.trace(`Not adding to queue because it is already in the queue\n${existingQueued.summary}`);
                            inQueue = true;
                            break;
                        }
                        if (data.length < meta.limit) {
                            break;
                        }
                        offset += meta.limit;
                    }

                    if (inQueue) {
                        continue;
                    }
                } catch (e) {
                    this.logger.warn(new SimpleError('Failed to check queued scrobble for existing before adding, will continue with adding anyway', { cause: e }));
                }
                // not in queue or existing queued check failed for some reason and we don't want to lose scrobble
                const {
                    data,
                    meta
                } = play
                const createPlayData = playToRepositoryCreatePlayOpts({
                    play: {
                        data,
                        meta
                    },
                    componentId: this.dbComponent.id, 
                    state: 'queued',
                    parentId: play.id
                });

                const playRow = await this.playRepo.createPlays([createPlayData]);
                const queueState = await this.queueRepo.create({componentId: this.dbComponent.id, playId: playRow[0].id, queueName: INGRESS_QUEUE, context}) as QueueStateSelect;
                const createdEvents = await this.playEventsRepo.createMany([
                    {playId: playRow[0].id, ...stateChangeToPlayEvent({state: 'queued'}), createdAt: playRow[0].seenAt.add(1,'ms')},
                    {playId: playRow[0].id, ...queueStateToPlayEvent(queueState), createdAt: queueState.createdAt}
                ]);
                createdQueuedPlays.push(playRow[0]);
                this.logger.debug(`Added ${buildTrackString(play)} to the queue`);
                this.setStatus(`Added Play from parent ${play.uid} to queue`);

                const queuedPlay = {id: nanoid(), source: meta.source, play: play}
                this.emitEvent('playQueued', {queuedPlay: queuedPlay});
                this.emitPlayInsert({...playRow[0], queueStates: [queueState], events: createdEvents} as unknown as PlayApiCommonDetailed);
                this.queuedLength += 1;
                this.queuedGauge.labels(this.getPrometheusLabels()).inc();
            }
        } else {
            throw new Error('Data passed to queuePlay must be either all be PlayObject or all PlaySelect objects');
        }
        return createdQueuedPlays;
    }

    queuePlayingNow = async (data: SourcePlayerObj, source: SourceIdentifier) => {
        if(!this.isReady()) {
            this.logger.debug('Not queueing now playing because scrobbler is not ready');
            return;
        }
        if(!this.isMonitoring()) {
            this.logger.debug('Not queueing now playing because scrobbler is not currently monitoring');
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
            // eslint-disable-next-line prefer-const
            let [shouldUpdate, npUpdateTopReason] = this.shouldUpdatePlayingNow(sourcePlayerData.player);
            let clientReason: string | undefined;
            if(!shouldUpdate) {
                this.npLogger.trace(`Not updating, ${npUpdateTopReason}`);
            }

            if(shouldUpdate) {
                const [clientUpdate, clientUpdateReason, level] = await this.shouldUpdatePlayingNowPlatformSpecific(sourcePlayerData.player);
                clientReason = clientUpdateReason;
                shouldUpdate = clientUpdate;
                if(!clientUpdate) {
                    this.npLogger[level ?? 'trace'](`Not updating, ${npUpdateTopReason} --BUT-- ${clientUpdateReason}`);
                }
            }

            const cleanNowPlayingQueue = new Map();

            // finally, do the update
            if(shouldUpdate) {
                this.npLogger.verbose(`Updating because ${npUpdateTopReason}${clientReason !== undefined ? ` --AND-- ${clientReason}` : ''}`);
                const isClearing = this.nowPlayingIsRealtime && shouldClearNPStatus(sourcePlayerData.player);
                try {
                    await this.doPlayingNow(sourcePlayerData.player);
                    this.npLogger.trace(`Now Playing updated.`);
                    this.setStatus('Now Playing updated');
                    if(!isClearing) {
                        this.nowPlayingExpirationDate = dayjs().add(nowPlayingExpirationDuration(sourcePlayerData.player));
                        this.emitEvent('playerUpdate', {...sourcePlayerData.player, expiration: this.nowPlayingExpirationDate});
                    } else {
                        this.nowPlayingExpirationDate = undefined;
                        this.emitEvent('playerDelete', {platformId: sourcePlayerData.player.platformId});
                    }
                    this.emitEvent('nowPlayingUpdated', sourcePlayerData);
                } catch (e) {
                    this.npLogger.warn(new Error('Error occurred while trying to update upstream Client, will ignore', {cause: e}));
                }
                this.nowPlayingLastPlay = sourcePlayerData.player;
                this.nowPlayingLastUpdated = dayjs();
            } else {
                if(sourcePlayerData.player.play?.meta?.sourceSOT === SOURCE_SOT.INGRESS && bufferNPUpdateReasonFragments.every((x) => npUpdateTopReason.includes(x))) {
                    // update is for an ingress Source and is valid
                    // but time since last update was less than client threshold interval
                    // 
                    // Ingress Sources may not send any additional updates to MS until a scrobble event
                    // so, otherwise, NP would never be updated until that happens
                    //
                    // to prevent that we want client NP to update with this *valid* update after min threshold is met
                    // so we will re-queue the update so that it gets used in a subsequent NP processing run
                    this.npLogger.debug('Re-queuing valid NP update from ingress Source that did not meet min threshold');
                    const sourceId = `${sourcePlayerData.source.name}-${sourcePlayerData.source.type}`;
                    cleanNowPlayingQueue.set(sourceId, this.nowPlayingQueue.get(sourceId));
                }
            }
            this.nowPlayingQueue = cleanNowPlayingQueue;
        }
    }

    nowPlayingHasDiscrepancy = (data: SourcePlayerObj): [boolean, string?] => {
        if(this.nowPlayingLastPlay === undefined || this.nowPlayingLastUpdated === undefined) {
            return [true, 'Now Playing has not yet been set'];
        }

        const playExistingDiscrepancy = (this.nowPlayingLastPlay.play !== undefined && data.play === undefined) || (this.nowPlayingLastPlay === undefined && data.play !== undefined);
        if(playExistingDiscrepancy) {
            return [true, `previous update ${this.nowPlayingLastPlay.play !== undefined ? 'exists' : 'does not exist'} and current update ${data.play !== undefined ? 'exists' : 'does not exist'}`];
        }

        if(this.nowPlayingLastPlay.play === undefined && data.play === undefined) {
            return [false, 'both previous and current update do not exist, nothing to update'];
        }

        if(this.nowPlayingLastPlay.status.calculated !== data.status.calculated) {
            return [true, 'player state has changed'];
        }
        
        if(!playObjDataMatch(data.play, this.nowPlayingLastPlay.play)) {
            return [true, 'previous update play data does not match current'];
        }

        return [false, 'previous update data matches current'];
    }

    protected nowPlayingThresholdsMet = (data: SourcePlayerObj) => {
        const lastUpdateDiff = Math.abs(dayjs().diff(this.nowPlayingLastUpdated, 's'));
        const minMet = this.nowPlayingMinThreshold(data.play) < lastUpdateDiff;
        const minReason = `time since last update (${lastUpdateDiff}s) is ${minMet ? 'greater' : 'less'} than min threshold ${this.nowPlayingMinThreshold(data.play)}s`;

        const maxMet = this.nowPlayingMaxThreshold(data.play) < lastUpdateDiff;
        const maxReason = `time since last update (${lastUpdateDiff}s) is ${maxMet ? 'greater' : 'less'} than max threshold ${this.nowPlayingMaxThreshold(data.play)}s`;

        return {
            minMet,
            minReason,
            maxMet,
            maxReason
        }
    }

    shouldUpdatePlayingNow = (sourcePlayerData: SourcePlayerObj): [boolean, string] => {
            let shouldUpdate: boolean;
            const thresholds = this.nowPlayingThresholdsMet(sourcePlayerData);
            // first we check if there is an obvious discrepancy between last updated and current update data
            // such as one missing, status change, no stored previous, etc...
            const [npUpdateTop, npUpdateTopReason] = this.nowPlayingHasDiscrepancy(sourcePlayerData);
            shouldUpdate = npUpdateTop;
            if(!npUpdateTop) {

                if(npUpdateTopReason === 'previous update data matches current') {
                    if(thresholds.maxMet) {
                        return [true, `previous matches current update --AND-- ${thresholds.maxReason}`];
                    }
                    return [false, `previous matches current update --BUT-- ${thresholds.maxReason}`];
                }

                return [false, npUpdateTopReason];
            } 

            let validStatusReason: string;
            if(shouldUpdate) {
                // next we check if new player state is even valid to use for an update
                const [statusValid, reason] = this.nowPlayingIsRealtime ? playerInValidNPUpdateState(sourcePlayerData) : playerInNPPlayingOnlyState(sourcePlayerData);
                validStatusReason = reason;
                shouldUpdate = statusValid;
                if(!statusValid) {
                    return [false, `${npUpdateTopReason} --BUT-- ${validStatusReason}`];
                } 
            }

            if(shouldUpdate && this.nowPlayingLastPlay !== undefined) {
                // at this point its possible we could update but we should respect minimum update intervals
                // and triggering this early means less, deeper checks
                const thresholds = this.nowPlayingThresholdsMet(sourcePlayerData);
                if (!thresholds.minMet) {
                    return [false, `${npUpdateTopReason} and ${validStatusReason} --BUT-- ${thresholds.minReason}`];
                }
                if (
                    // status hasn't changed
                    this.nowPlayingLastPlay.status?.calculated === sourcePlayerData.status?.calculated
                    // and both plays are defined and have not changed
                    && (this.nowPlayingLastPlay.play !== undefined && sourcePlayerData.play !== undefined)
                    && playObjDataMatch(sourcePlayerData.play, this.nowPlayingLastPlay.play)) {
                    
                    // only update if we are passed max threshold
                    shouldUpdate = thresholds.maxMet;
                    if(!thresholds.maxMet) {
                        return [false, `${npUpdateTopReason} and ${validStatusReason} --BUT-- ${thresholds.maxReason}`];
                    }
                }
            }

            if(shouldUpdate) {
                // check for valid play data if the update should be for a playing track
                if(playerInNPPlayingOnlyState(sourcePlayerData)) {
                    if(sourcePlayerData.play?.data?.track === undefined) {
                        return [false, `${npUpdateTopReason} and ${validStatusReason} --BUT-- play is missing track information`];
                    }
                    if((sourcePlayerData.play?.data?.artists ?? []).length === 0) {
                        return [false, `${npUpdateTopReason} and ${validStatusReason} --BUT-- play is missing artist information`];
                    }
                }
            }

            if(shouldUpdate && this.nowPlayingIsRealtime) {
                // prevent multiple clearing updates
                if(this.nowPlayingLastPlay !== undefined && shouldClearNPStatus(sourcePlayerData) && shouldClearNPStatus(this.nowPlayingLastPlay)) {
                    return [false, `${npUpdateTopReason} and ${validStatusReason} --BUT-- last update already cleared now playing`];
                }
            }

            return [true, `${npUpdateTopReason} and ${validStatusReason}`];
    }

    /** Implement this for specific requirements for updating playing now based on the scrobbler platform */
    protected async shouldUpdatePlayingNowPlatformSpecific(data: SourcePlayerObj): Promise<[boolean, string?, LogLevel?]> {
        return [true];
    }

    protected doPlayingNow = (data: SourcePlayerObj): Promise<any> => Promise.resolve(undefined)

    protected statusExpiresSoon = () => {
        if(this.nowPlayingExpirationDate === undefined) {
            return false;
        }
        // may want to make this configurable in the future?
        return Math.abs(dayjs().diff(this.nowPlayingExpirationDate, 's')) < 15;
    }
    protected statusAlreadyExpired = () => {
        if(this.nowPlayingExpirationDate === undefined) {
            return false;
        }
        return dayjs().isAfter(this.nowPlayingExpirationDate);
    }

    public getQueued = (queueName: string, offset?: number) => {
        return this.playRepo.getQueued(queueName, {offset});
    }

    public getPlaysPaginated = (args: QueryPlaysOpts) => {
        const {
            limit,
            offset,
            with: withQuery = ['input','parent-input','queues'],
            ...rest
        } = args;
        const parsedLimit = limit !== undefined ? Number.parseInt(limit as unknown as string) : undefined;
        const parsedOffset = offset !== undefined ? Number.parseInt(offset as unknown as string) : undefined;
        return this.playRepo.findPlaysPaginated({limit: parsedLimit, offset: parsedOffset, with: withQuery, ...rest});
    }

    public async getPlayApiResponse(uid: string, opts: {with?: WithPlayRelation[]} = {}): Promise<PlayApiCommonDetailed> {
        const {
            with: withQuery = ['input','parent-input','queues','events'],
        } = opts;
        return await this.playRepo.findByUid(uid, { with: withQuery as WithPlayRelation[] }) as unknown as PlayApiCommonDetailed;
    }

    public async deletePlay(play: PlayWith<'children'>, children?: boolean): Promise<void> {
        if(children) {
            await this.playRepo.deleteByIds([play.id, ...(play.children ??  []).map(x => x.id)]);
            this.emitEvent('playDelete', {uid: play.uid});
            for(const p of play.children) {
                this.emitEvent('playDelete', {uid: p.uid, componentId: p.componentId});
            }
        } else {
            await this.playRepo.deleteById(play.id);
            this.emitEvent('playDelete', {uid: play.uid, componentId: play.componentId});
        }
    }

    public emitEvent = (eventName: string, payload: object) => {
        this.emitter.emit(eventName, {
            data: payload,
            type: this.type,
            name: this.name,
            componentId: this.dbComponent?.id,
            from: 'client'
        });
    }
}

export const nowPlayingUpdateByPlayDuration: NowPlayingUpdateThreshold = (play?: PlayObject) => (play?.data?.duration ?? 30) + 1

export const shouldClearNPStatus = (data: SourcePlayerObj) => [
    CALCULATED_PLAYER_STATUSES.stopped,
    CALCULATED_PLAYER_STATUSES.paused,
    CALCULATED_PLAYER_STATUSES.stale,
    CALCULATED_PLAYER_STATUSES.orphaned,
].includes(data.status.calculated as ReportedPlayerStatus)

export const playerInNPPlayingOnlyState = (data: SourcePlayerObj): [boolean, string] => {
    // for lower-interval update clients (like listenbrainz, lastfm) IE not real-time
    // we don't want to create updates for paused/stopped because the NP data for these services
    // is only supposed to be updated intermittently
    //
    // so only allow an update if the player is actually playing
    if(!data.nowPlayingMode) {
        if(data.status.calculated === CALCULATED_PLAYER_STATUSES.playing) {
            return [true, `calculated player status is ${data.status.calculated}`];
        }
        return [false, `calculated player status is ${data.status.calculated} but must be playing`];
    }
    return npPlayerInValidNPUpdateState(data);
}

export const playerInValidNPUpdateState = (data: SourcePlayerObj): [boolean, string] => {
    // if the source player is not a "Now Playing" type (lz, endpoint Source, etc...)
    // then we only want to allow an update if the player state is a known "good" type IE don't allow on unknown
    if(!data.nowPlayingMode) {
        if([
            CALCULATED_PLAYER_STATUSES.stopped,
            CALCULATED_PLAYER_STATUSES.paused,
            CALCULATED_PLAYER_STATUSES.playing,
            CALCULATED_PLAYER_STATUSES.stale,
            CALCULATED_PLAYER_STATUSES.orphaned,
        ].includes(data.status.calculated as ReportedPlayerStatus)) {
            return [true, `player in valid update state: '${data.status.calculated }'`];
        }
        return [false,`player is not in state: stopped | paused | playing | stale | orphaned => Found '${data.status.calculated }'`];
    }

    return npPlayerInValidNPUpdateState(data);
}

export const npPlayerInValidNPUpdateState = (data: SourcePlayerObj): [boolean, string] => {
    assert(data.nowPlayingMode === true, 'data is not in nowPlayingMode');

    // if the source player *is* a "Now Playing" type
    // then we allow update on anything that isn't explicitly stopped
    // since these sources have limited reporting capability for calculating a valid state
    if(CALCULATED_PLAYER_STATUSES.stopped !== data.status.calculated as ReportedPlayerStatus) {
        return [true, `NP player in valid update state: '${data.status.calculated }'`];
    }
    return [false, `NP player is is invalid update state: stopped`];
}

export const nowPlayingExpirationDuration = (data: Pick<SourcePlayerObj, 'play' | 'position'>): Duration => {
    let expiry: Dayjs = dayjs().add(10, 'minute');

    const {
        position, play
    } = data;

    // if we have position and duration then expiration is set as calculated end of listening session
    if (position !== undefined && play?.data.duration !== undefined) {
        expiry = dayjs().add(play.data.duration - position, 'second');
    } else if (play?.data.duration !== undefined) {
        // else if we have duration but not position then use track duration
        expiry = dayjs().add(play.data.duration, 'second');
    }

    // otherwise use 10 minutes
    return dayjs.duration(expiry.diff(dayjs(), 'ms'));
};
