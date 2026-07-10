import { childLogger, type Logger, type LogLevel } from "@foxxmd/logging";
import dayjs, { type Dayjs } from "dayjs";
import type {Duration} from "dayjs/plugin/duration.js";
import type EventEmitter from "events";
import { nanoid } from "nanoid";
import type { MarkOptional } from "ts-essentials";
import {
    type DeadLetterScrobble,
    type NowPlayingUpdateThreshold,
    type PlayObject,
    type QueuedScrobble, type ScrobbleActionResult, type PlayMatchResult, type SourcePlayerObj,
    type ErrorLike,
    CLIENT_INGRESS_QUEUE,
    CLIENT_DEAD_QUEUE,
    type PlayOriginal,
    type PlayLifecycle,
    type SourcePlayerJson,
    QUEUE_STATUS_COMPLETED
} from "../../core/Atomic.ts";
import { artistNamesToCredits, buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.ts";
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
import type {ReportedPlayerStatus} from '../../core/Atomic.ts';
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
import { removeUndefinedKeys } from '../../core/DataUtils.ts';
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
import { generateLoggableAbortReason, ScrobbleSubmitError, SimpleError } from "../common/errors/MSErrors.ts";
import {isErrorLike, serializeError} from 'serialize-error';
import { DEFAULT_NEW_PADDING, groupPlaysToTimeRanges } from "../utils/ListenFetchUtils.ts";
import { spawn, isAbortError, delay } from 'abort-controller-x';
import { DrizzlePlayRepository, playToRepositoryCreatePlayOpts, type QueryPlaysOpts, type WithPlayRelation } from "../common/database/drizzle/repositories/PlayRepository.ts";
import type {ComponentMigrationNew, PlaySelect, PlaySelectWithQueueStates, QueueStateNew, QueueStateSelect} from "../common/database/drizzle/drizzleTypes.ts";
import { asPlay } from "../../core/PlayMarshalUtils.ts";
import { DrizzleQueueRepository } from "../common/database/drizzle/repositories/QueueRepository.ts";
import { GenericRepository } from "../common/database/drizzle/repositories/BaseRepository.ts";
import assert from "node:assert";
import { COMPONENT_STATE, type ComponentClientApiJson, type PlayApiCommonDetailed } from "../../core/Api.ts";
import type {ComponentState} from "react";

type PlatformMappedPlays = Map<string, {player: SourcePlayerObj, source: SourceIdentifier}>;
type NowPlayingQueue = Map<string, PlatformMappedPlays>;

const platformTruncate = truncateStringToLength(10);

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
    nowPlayingFilter: (queue: NowPlayingQueue) => SourcePlayerObj | undefined;
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

    protected playRepo!: DrizzlePlayRepository;
    protected queueRepo!: DrizzleQueueRepository;
    protected migrationRepo!: GenericRepository<'componentMigrations'>;

    constructor(type: any, name: any, config: CommonClientConfig, emitter: EventEmitter, logger: Logger) {
        super(config);
        this.componentType = 'client';
        this.type = type;
        this.name = name;
        this.logger = childLogger(logger, this.getIdentifier());
        this.npLogger = childLogger(this.logger, 'Now Playing');
        this.dupeLogger = childLogger(this.logger, 'Dupe');
        this.deadLogger = childLogger(this.logger, CLIENT_DEAD_QUEUE);
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
                        this.error = err;
                        this.logger.error(err);
                    });
                },
                (err: Error) => {
                    this.error = err;
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
                                this.warning = e;
                                this.logger.error(e);
                            })
                        }
                        return new Promise((resolve, reject) => resolve);
                    },
                    (err: Error) => {
                        this.warning = err;
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
                await this.initialize({force: false, notify: true, notifyTitle: 'Could not initialize automatically'});
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
        try {
            await this.migrateCachedScrobbles();
        } catch (e) {
            this.logger.warn(new Error('Unable to migrate cached scrobbles (if any). Will continue init and ignore this error.', {cause: e}));
        }
        this.generateStaggerMappers();
    }

    protected async postDatabase(): Promise<void> {
        this.playRepo = new DrizzlePlayRepository(this.db, {logger: this.logger});
        this.queueRepo = new DrizzleQueueRepository(this.db, {logger: this.logger});
        this.migrationRepo = new GenericRepository<'componentMigrations'>(this.db, 'componentMigrations', 'Component Migrations', {logger: this.logger});
        this.playRepo.componentId = this.dbComponent.id;
        this.queueRepo.componentId = this.dbComponent.id;
        const counts = await this.playRepo.getComponentPlayCountByState();
        const scrobbledCount = counts.find(x => x.state === 'scrobbled');
        if(scrobbledCount !== undefined) {
            this.tracksScrobbledTotal = scrobbledCount['count(*)'];
        }
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
        return this.scrobbling ? COMPONENT_STATE.RUNNING : COMPONENT_STATE.IDLE;
    }

    protected getComponentApiData() {
        return {
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
            deadLetterScrobbles: this.deadLetterQueued,
            deadLetterScrobblesTotal: this.deadLetterLength,
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
                this.warning = npErr;
                this.emitComponentUpdate<Partial<ComponentClientApiJson>>({warning: npErr});
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
                preferredPlays.sort((a, b) => a[0].localeCompare(b[0]));
                return preferredPlays[0][1].player;
            }
        }
    }

    protected async migrateCachedScrobbles(): Promise<void> {
        const logger = childLogger(this.logger, ['Cached Scrobble Migration']);
        let shouldMigrate: boolean = false;
        const migration = this.dbComponent.migrations.find(x => x.name === 'cachedScrobbles');
        if (migration === undefined) {
            logger.verbose('No migration has run yet, running now...');
            shouldMigrate = true;
        } else if (migration.success === false) {
            logger.verbose('Re-running previously failed migration now...');
            shouldMigrate = true;
        }
        if (shouldMigrate) {
            const migrationEntry: ComponentMigrationNew = migration !== undefined ? migration : {componentId: this.dbComponent.id, name: 'cachedScrobbles'};
            try {
                const cachedQueue = (await this.cache.cacheScrobble.get(`${this.getMachineId()}-queue`) as QueuedScrobble<PlayObject<{migrated?: boolean, lifecycle?: PlayLifecycle}>>[] ?? []);
                const migratedQueue: QueuedScrobble<PlayObject>[] = [];
                let allGood = true;
                if (cachedQueue.length > 0) {
                    logger.info('Migrating cached scrobbles to database...');
                    for (const cachedQueuedScrobble of cachedQueue) {
                        if(cachedQueuedScrobble.play.meta?.migrated === true) {
                            logger.debug(`Skipping already migrated play => ${buildTrackString(cachedQueuedScrobble.play)}`);
                            continue;
                        }
                        const play = asPlay(cachedQueuedScrobble.play)  as PlayObject<{migrated?: boolean, lifecycle?: PlayLifecycle}>;
                        const {
                            meta: {
                                lifecycle,
                                ...metaRest
                            },
                            data: {
                                listenRanges,
                                artists,
                                albumArtists,
                                ...dataRest
                            } = {},
                        } = play;
                        try {
                            const updatedPlay: PlayObject = {
                                ...play,
                                data: {
                                    artists: artists === undefined ? undefined : artistNamesToCredits(artists as unknown as string[]),
                                    albumArtists: albumArtists === undefined ? undefined : artistNamesToCredits(albumArtists as unknown as string[]),
                                    ...dataRest
                                },
                                meta: metaRest,
                                
                                lifecycle: lifecycle?.steps
                            }
                            if(lifecycle !== undefined) {
                                if('scrobble' in lifecycle) {
                                    updatedPlay.scrobble = lifecycle.scrobble;
                                }
                                if('input' in lifecycle || 'original' in lifecycle) {
                                    updatedPlay.original = removeUndefinedKeys<PlayOriginal>({
                                        
                                        data: lifecycle.input,
                                        play: lifecycle.original
                                    })
                                }
                            }
                            // return play object without going through transform since it was (presumably) already transformed before being cached
                            const res = await this.queueScrobble(updatedPlay, updatedPlay.meta.source, async (x) => x);
                            if(res.length === 1) {
                                logger.verbose(`Migrated Play ${res[0].uid} => ${buildTrackString(play)}`);
                            }
                            cachedQueuedScrobble.play.meta.migrated = true;
                            migratedQueue.push(cachedQueuedScrobble)
                        } catch (e) {
                            migratedQueue.push(cachedQueuedScrobble);
                            allGood = false;
                            logger.warn(new Error(`Failed to migrate Play ${buildTrackString(play)}`, { cause: e }));
                        }
                    }
                    await this.cache.cacheScrobble.set(`${this.getMachineId()}-queue`, migratedQueue); 
                    logger[allGood ? 'info' : 'warn'](allGood ? 'Finished migrating all queued scrobbles.' : 'Migrated queued scrobbles with errors');
                } else {
                    logger.info('No scrobbles to migrate');
                }

                const cachedDead = (await this.cache.cacheScrobble.get(`${this.getMachineId()}-dead`) as DeadLetterScrobble<PlayObject<{migrated?: boolean, lifecycle?: PlayLifecycle}>>[] ?? []);
                const migratedDead: DeadLetterScrobble<PlayObject>[] = [];
                if (cachedDead.length > 0) {
                    logger.info('Migrating failed scrobbles to database...');
                    let allGood = true;
                    for (const cDeadScrobble of cachedDead) {
                        if(cDeadScrobble.play.meta?.migrated === true) {
                            logger.debug(`Skipping already migrated play => ${buildTrackString(cDeadScrobble.play)}`)
                            continue;
                        }
                        const play = asPlay(cDeadScrobble.play) as PlayObject<{migrated?: boolean, lifecycle?: PlayLifecycle}>;
                        const {
                            meta: {
                                lifecycle,
                                ...metaRest
                            },
                            data: {
                                listenRanges,
                                artists,
                                albumArtists,
                                ...dataRest
                            } = {},
                        } = play;
                        const updatedDeadPlay: PlayObject = {
                            ...play,
                            data: {
                                artists: artists === undefined ? undefined : artistNamesToCredits(artists as unknown as string[]),
                                albumArtists: albumArtists === undefined ? undefined : artistNamesToCredits(albumArtists as unknown as string[]),
                                ...dataRest
                            },
                            meta: metaRest,
                            lifecycle: lifecycle?.steps
                        }
                        if(lifecycle !== undefined) {
                            if('scrobble' in lifecycle) {
                                updatedDeadPlay.scrobble = lifecycle.scrobble;
                            }
                            if('input' in lifecycle || 'original' in lifecycle) {
                                updatedDeadPlay.original = removeUndefinedKeys<PlayOriginal>({
                                    data: lifecycle.input,
                                    play: lifecycle.original
                                })
                            }
                        }
                        try {
                            const res = await this.playRepo.createPlays([
                                playToRepositoryCreatePlayOpts({
                                    play: updatedDeadPlay,
                                    componentId: this.dbComponent.id,
                                    state: 'failed',
                                    parentId: play.id
                                })
                            ]);
                            logger.verbose(`Added Play ${res[0].uid} to database => ${buildTrackString(play)}`);
                            await this.addDeadLetterScrobble(res[0], cDeadScrobble.error);
                            logger.verbose(`Added Play ${res[0].uid} to Failed Queue`);
                            cDeadScrobble.play.meta.migrated = true;
                            migratedDead.push(cDeadScrobble);
                        } catch (e) {
                            migratedDead.push(cDeadScrobble);
                            allGood = false;
                            logger.warn(new Error(`Failed to migrate Play to failed queued ${buildTrackString(play)}`, { cause: e }));
                        }
                    }
                    logger[allGood ? 'info' : 'warn'](allGood ? 'Finished migrating all failed scrobbles.' : 'Migrated failed scrobbles with errors');
                    await this.cache.cacheScrobble.set(`${this.getMachineId()}-dead`, migratedDead); 
                } else {
                    logger.info('No dead scrobbles to migrate');
                }

                if(migration === undefined) {
                    await this.migrationRepo.create({...migrationEntry, success: allGood});
                } else {
                    await this.migrationRepo.updateById(migration.id, {success: allGood});
                }
                logger[allGood ? 'info' : 'warn'](`Migration done${allGood === false ? ' with errors' : ''}`);
            } catch (e) {
                if(migration === undefined) {
                    this.migrationRepo.create({...migrationEntry, success: false, error: e});
                } else {
                    this.migrationRepo.updateById(migration.id, {success: false, error: e});
                }
                throw new Error('Cached Scrobble Migration failed with unexpected error', {cause: e});
            }
        } else {
            logger.debug('Cached Scrobbles Migration already run successfully!');
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
                this.warning = preloadErr;
                this.emitComponentUpdate<Partial<ComponentClientApiJson>>({warning: preloadErr});
                this.logger.warn(preloadErr);
            }
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

    async getSOTScrobblesForPlay(play: PlayObject): Promise<PlayObject[]> {
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
        this.tracksScrobbledTotal++;
    }

    findExistingSubmittedPlayObj = async (playObjPre: PlayObject): Promise<([undefined, undefined] | [ScrobbledPlayObject, ScrobbledPlayObject[]])> => {

        const playObj = await this.transformPlay(playObjPre, TRANSFORM_HOOK.candidate);

        if(this.transformRules.compare?.existing === undefined) {
            // if no existing transform then we can run cheap db match
            const cheapExisting = await this.playRepo.checkExisting(playObj, {states: ['scrobbled']});
            if(cheapExisting !== undefined) {
                const s: ScrobbledPlayObject = {play: cheapExisting.play, scrobble: cheapExisting.play.scrobble?.mergedScrobble};
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
                this.logger.trace(e);
                componentUpdate.status = 'Processing cancelled';
            } else {
                const err = new Error('Scrobble processing stopped with error', { cause: e });
                this.logger.warn(err);
                componentUpdate.status = 'Processing stopped with error';
                componentUpdate.warning = err;
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
                    await this.notify({title: `Processing Error`, message: `Encountered error while scrobble processing and client is no longer usable, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    throw e;
                } else if (this.authGated()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer being authenticated.');
                    await this.notify({title: ` Processing Error`, message: `Encountered error while scrobble processing and client is no longer authenticated, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    throw e;
                } else if (this.scrobbleRetries < maxRetries) {
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
                let nextQueued = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE);
                if(nextQueued !== undefined) {
                    while (nextQueued !== undefined) {
                        await this.processQueueCurrentScrobble(nextQueued, signal);
                        if(this.error !== undefined) {
                            // we made it through a scrobble without any issues so clear any issue we may have previously had
                            this.error = undefined;
                            this.emitComponentUpdate<Partial<ComponentClientApiJson>>({error: null});
                        }
                        nextQueued = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE)
                    }
                    this.emitEvent('queueEmptied', {});
                    this.setStatus('Waiting for Plays from Sources');
                }
                this.componentRepo.updateById(this.dbComponent.id, {lastActiveAt: dayjs(), lastReadyAt: dayjs()});
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

    protected processQueueCurrentScrobble = async (currQueuedPlay: PlaySelectWithQueueStates, signal: AbortSignal) => {
        signal.throwIfAborted();
        //const currQueuedPlay = await this.playRepo.getQueueNext(CLIENT_INGRESS_QUEUE);
        // if (currQueuedPlay === undefined) {
        //     this.logger.trace('Nothing queued');
        //     return;
        // }
        this.setStatus(`Processing Play ${currQueuedPlay.id}`);
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
                currQueuedPlay.play.scrobble = {
                    ...(currQueuedPlay.play.scrobble ?? {}),
                    match: matchResult,
                    createdAt: dayjs()
                }
                signal.throwIfAborted();
                if (!matchResult.match) {
                    const transformedScrobble = await this.transformPlay(currQueuedPlay.play, TRANSFORM_HOOK.postCompare);
                    signal.throwIfAborted();
                    try {
                        const scrobbledPlay = await this.scrobble(transformedScrobble, {signal});
                        currQueuedPlay.play = scrobbledPlay;
                        await this.addScrobbledTrack(scrobbledPlay);
                        //handledShiftedPlay = true;
                    } catch (e) {
                        currQueuedPlay.play.scrobble = {
                            createdAt: dayjs()
                        };

                        const submitError = findCauseByReference(e, ScrobbleSubmitError);
                        if (submitError !== undefined) {
                            currQueuedPlay.play.scrobble.payload = submitError.payload;
                            currQueuedPlay.play.scrobble.response = submitError.responseBody;
                            currQueuedPlay.play.scrobble.error = serializeError(submitError);
                        } else {
                            currQueuedPlay.play.scrobble.payload = this.playToClientPayload(transformedScrobble);
                            currQueuedPlay.play.scrobble.error = serializeError(e);
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
                    this.setStatus(`Play ${currQueuedPlay.id} detected as dupe`);
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
                queueState.queueStatus = 'failed';
                queueState.error = queueError;
                await this.playRepo.updateById(currQueuedPlay.id, {state: 'failed', error: queueError, play: currQueuedPlay.play});
                currQueuedPlay.state = 'failed';
                //currQueuedPlay.error = queueError;
            } else {
                await this.queueRepo.updateById(queueState.id, {queueStatus: 'completed'});
                await this.playRepo.updateById(currQueuedPlay.id, {state: successState ?? 'scrobbled', play: currQueuedPlay.play});
                currQueuedPlay.state = successState ?? 'scrobbled';
                queueState.queueStatus = 'completed';
            }
            this.emitPlayUpdate({...currQueuedPlay, queueStates: [queueState]} as unknown as PlayApiCommonDetailed);
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
            } else {
                this.setStatus(`Processing ${processable} Dead Plays`);
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

        const deadScrobble: PlaySelectWithQueueStates = await this.playRepo.findByUid(uid, {hydrate: ['asPlay']});
        if(deadScrobble === undefined) {
            throw new Error(`Play ${uid} does not exist for ${this.name}`);
        }
        if(deadScrobble.state === 'scrobbled') {
            throw new Error(`Play ${uid} is already scrobbled.`);
        }
        const deadQueueState: QueueStateSelect = deadScrobble.queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE);
        if(deadQueueState === undefined) {
            throw new Error(`Play ${uid} is not currently queued in dead letter.`);
        }
        this.setStatus(`Processing Dead Play ${uid}`);
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
                //this.playRepo.updateById(deadScrobble.id, {error: e});
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
        deadScrobble.play.scrobble = {
            ...(deadScrobble.play.scrobble ?? {}),
            match: matchResult,
            createdAt: dayjs()
        }
        if(!matchResult.match) {
            const transformedScrobble = await this.transformPlay(deadScrobble.play, TRANSFORM_HOOK.postCompare);
            signal?.throwIfAborted();
            try {
                const scrobbledPlay = await this.scrobble(transformedScrobble);
                deadScrobble.play = scrobbledPlay;
                await this.addScrobbledTrack(scrobbledPlay);
                this.playRepo.updateById(deadScrobble.id, {play: deadScrobble.play});
                this.queueRepo.updateById(deadQueueState.id, {error: null, updatedAt: dayjs(), queueStatus: QUEUE_STATUS_COMPLETED});
                this.removeDeadLetterScrobble(deadScrobble, 'scrobbled', true);
            } catch (e) {
                deadScrobble.play.scrobble = {
                    ...(deadScrobble.play.scrobble ?? {}),
                    createdAt: dayjs()
                }
                const submitError = findCauseByReference(e, ScrobbleSubmitError);
                if(submitError !== undefined) {
                    deadScrobble.play.scrobble.payload = submitError.payload;
                    deadScrobble.play.scrobble.response = submitError.responseBody;
                    deadScrobble.play.scrobble.error = serializeError(submitError);
                } else {
                    deadScrobble.play.scrobble.payload = this.playToClientPayload(transformedScrobble);
                    deadScrobble.play.scrobble.error = serializeError(e);
                }

                this.queueRepo.updateById(deadQueueState.id, {retries: deadQueueState.retries + 1, error: e, updatedAt: dayjs(), queueStatus: 'failed'});
                this.playRepo.updateById(deadScrobble.id, {play: deadScrobble.play});
                // deadScrobble.retries++;
                // deadScrobble.error = messageWithCauses(e);
                // deadScrobble.lastRetry = dayjs();
                this.deadLogger.error(new Error(`${deadScrobble.uid} - Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${deadScrobble.play.meta.source}' due to error`, {cause: e}));
                //this.deadLetterScrobbles[deadScrobbleIndex] = deadScrobble;
                this.emitEvent('updateDeadLetter', {dead: deadScrobble});
                return [false, deadScrobble];
            }
        } else {
            this.playRepo.updateById(deadScrobble.id, {play: deadScrobble.play});
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
        this.setStatus(`Removing Dead Play ${dead} from queue`);
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
        const queueUpdate: Partial<QueueStateNew> = {
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

    queueScrobble = async (data: PlayObject | PlayObject[], source: string, transformFunc?: (x: PlayObject) => Promise<PlayObject>) => {
        const playDatas = (Array.isArray(data) ? data : [data]).map(x => ({...x, meta: {...x.meta, seenAt: dayjs()}}));

        const createdQueuedPlays: PlaySelect[] = [];

        for await(const play of pMapIterable(playDatas, this.staggerMappers.preCompare(async x => transformFunc !== undefined ? await transformFunc(x) : await this.transformPlay(x, TRANSFORM_HOOK.preCompare)), {concurrency: 3})) {
            try {
                // cheap check, looks for play data (non-meta) hash, playdate, and optionally mbid recording
                const cheapExisting = await this.playRepo.checkExisting(play, { queueName: CLIENT_INGRESS_QUEUE });
                if (cheapExisting !== undefined) {
                    const qs = cheapExisting.queueStates.find(x => x.queueName === CLIENT_INGRESS_QUEUE);
                    this.logger.trace(`Not adding to queue because it is already in the queue, discovered via hash/mbid, last queued at ${todayAwareFormat(qs.createdAt)}`);
                    continue;
                }
                // then chunked queued plays
                let offset = 0;
                let inQueue = false;
                while (true) {
                    const { data, meta } = await this.playRepo.getQueued(CLIENT_INGRESS_QUEUE, { offset });
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
            const queueState = await this.queueRepo.create({componentId: this.dbComponent.id, playId: playRow[0].id, queueName: CLIENT_INGRESS_QUEUE});
            createdQueuedPlays.push(playRow[0]);
            this.logger.debug(`Added ${buildTrackString(play)} to the queue`);
            this.setStatus(`Added Play from parent ${play.uid} to queue`);

            const queuedPlay = {id: nanoid(), source, play: play}
            //await this.playRepo.updateById(play.meta.dbId, {play});
            this.emitEvent('scrobbleQueued', {queuedPlay: queuedPlay});
            this.emitPlayInsert({...playRow[0], queueStates: [queueState]} as unknown as PlayApiCommonDetailed);
            this.queuedLength += 1;
            //this.queuedScrobbles.push(queuedPlay);
            this.queuedGauge.labels(this.getPrometheusLabels()).inc();
            // this is wasteful but we don't want the processing loop popping out-of-order (by date) scrobbles
            //this.queuedScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        }
        return createdQueuedPlays;
    }

    addDeadLetterScrobble = async (data: PlaySelect, error: (Error | string) = 'Unspecified error') => {
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
        const deadData = {id: nanoid(), retries: 0, error: e, play: data.play};
        //this.deadLetterScrobbles.push(deadData);
        //this.deadLetterScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        this.emitEvent('deadLetter', {dead: deadData});
        this.setStatus(`Moved ${data.uid} to Dead Play queue`);
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
            // eslint-disable-next-line prefer-const
            let [shouldUpdate, npUpdateTopReason] = this.shouldUpdatePlayingNow(sourcePlayerData);
            let clientReason: string | undefined;
            if(!shouldUpdate) {
                this.npLogger.trace(`Not updating, ${npUpdateTopReason}`);
            }

            if(shouldUpdate) {
                const [clientUpdate, clientUpdateReason, level] = await this.shouldUpdatePlayingNowPlatformSpecific(sourcePlayerData);
                clientReason = clientUpdateReason;
                shouldUpdate = clientUpdate;
                if(!clientUpdate) {
                    this.npLogger[level ?? 'trace'](`Not updating, ${npUpdateTopReason} --BUT-- ${clientUpdateReason}`);
                }
            }

            // finally, do the update
            if(shouldUpdate) {
                this.npLogger.verbose(`Updating because ${npUpdateTopReason}${clientReason !== undefined ? ` --AND-- ${clientReason}` : ''}`);
                const isClearing = this.nowPlayingIsRealtime && shouldClearNPStatus(sourcePlayerData);
                try {
                    await this.doPlayingNow(sourcePlayerData);
                    this.npLogger.trace(`Now Playing updated.`);
                    this.setStatus('Now Playing updated');
                    if(!isClearing) {
                        this.nowPlayingExpirationDate = dayjs().add(nowPlayingExpirationDuration(sourcePlayerData));
                        this.emitEvent('playerUpdate', {...sourcePlayerData, expiration: this.nowPlayingExpirationDate});
                    } else {
                        this.nowPlayingExpirationDate = undefined;
                        this.emitEvent('playerDelete', {platformId: sourcePlayerData.platformId});
                    }
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
                    } else {
                        return [false, `previous matches current update --BUT-- ${thresholds.maxReason}`];
                    }
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
                else if (
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
        const parsedLimit = limit !== undefined ? Number.parseInt(limit as unknown as string) : undefined;
        const parsedOffset = offset !== undefined ? Number.parseInt(offset as unknown as string) : undefined;
        return this.playRepo.findPlaysPaginated({limit: parsedLimit, offset: parsedOffset, with: withQuery, ...rest});
    }

    public async getPlayApiResponse(uid: string, opts: {with?: WithPlayRelation[]} = {}): Promise<PlayApiCommonDetailed> {
        const {
            with: withQuery = ['input','parent-input','queues'],
        } = opts;
        return await this.playRepo.findByUid(uid, { with: withQuery as WithPlayRelation[] }) as unknown as PlayApiCommonDetailed;
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
