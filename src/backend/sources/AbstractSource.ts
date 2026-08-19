import { childLogger, type LogDataPretty, type LogLevel } from '@foxxmd/logging';
import dayjs, { type Dayjs } from "dayjs";
import type { EventEmitter } from "events";
import type { FixedSizeList } from "fixed-size-list";
import { INGRESS_QUEUE, PARSED_FROM, type PlayMatchResult, type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import { buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.ts";
import AbstractComponent from "../common/AbstractComponent.ts";
import {
    type Authenticatable,
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_POLLING_MAX_INTERVAL,
    DEFAULT_RETRY_MULTIPLIER,
    type GroupedFixedPlays,
    type InternalConfig,
    type ProgressAwarePlayObject,
} from "../common/infrastructure/Atomic.ts";
import type {PARSED_FROM_TYPE, PlayState, PlayUserId} from '../../core/Atomic.ts';
import type {DeviceId} from '../../core/Atomic.ts';
import type {SourceConfig} from '../common/infrastructure/config/source/sources.ts';
import type {SourceType} from "../../core/Atomic.ts";
import { TRANSFORM_HOOK } from "../../core/Transform.ts";
import TupleMap from "../common/TupleMap.ts";
import {
    difference,
    isDebugMode,
    pollingBackoff,
    sleep,
    sortByOldestPlayDate,
} from "../utils.ts";
import { sortByNewestPlayDate } from '../../core/PlayUtils.ts';
import { formatNumber } from '../../core/DataUtils.ts';
import { timeToHumanTimestamp } from "../../core/TimeUtils.ts";
import { todayAwareFormat } from "../../core/TimeUtils.ts";
import { getRoot } from '../ioc.ts';
import { componentFileLogger } from '../common/logging.ts';
;
import { messageWithCausesTruncatedDefault } from "../../core/ErrorUtils.ts";
import { existingScrobble, type ExistingScrobbleOpts } from '../utils/PlayComparisonUtils.ts';
import { consumeQueue } from '../utils/AsyncUtils.ts';
import pMap from 'p-map';
import type { Counter, Gauge } from 'prom-client';
import { normalizeStr } from '../utils/StringUtils.ts';
import { spawn, isAbortError, delay, throwIfAborted } from 'abort-controller-x';
import { generateLoggableAbortReason, SimpleError, StageChangeError } from '../common/errors/MSErrors.ts';
import { DrizzlePlayRepository, playToRepositoryCreatePlayOpts, type QueryPlaysOpts, type RequestPlayQuery, type WithPlayRelation } from '../common/database/drizzle/repositories/PlayRepository.ts';
import { asPlay } from '../../core/PlayMarshalUtils.ts';
import { AsyncTask, SimpleIntervalJob, ToadScheduler } from 'toad-scheduler';
import { COMPONENT_STATE, type ComponentSourceApiJson, type ComponentState, type PlayApiCommonDetailed } from '../../core/Api.ts';
import type {PaginatedResponse} from "../../core/Api.ts";
import type { PlaySelect, PlaySelectWithQueueStates, QueueStateNew, QueueStateSelect } from '../common/database/drizzle/drizzleTypes.ts';
import { DrizzleQueueRepository } from '../common/database/drizzle/repositories/QueueRepository.ts';
import { DrizzlePlayEventsRepository } from '../common/database/drizzle/repositories/PlayEventsRepository.ts';
import { PLAY_EVENT_TYPE, type PlayEvent } from '../../core/PlayEvent.ts';
import { queueStateToEventData } from '../common/database/drizzle/entityUtils.ts';

export interface RecentlyPlayedOptions {
    limit?: number
    formatted?: boolean

    display?: boolean
}

export default abstract class AbstractSource extends AbstractComponent implements Authenticatable {

    declare type: SourceType;

    declare config: SourceConfig;
    clients: string[];
    instantiatedAt: Dayjs;
    lastActivityAt: Dayjs;

    multiPlatform: boolean = false;

    localUrl: URL;

    configDir: string;

    canPoll: boolean = false;
    polling: boolean = false;
    canBacklog: boolean = false;
    protected discoverQueueAbortController: AbortController | undefined;
    protected discoverQueuePromise: Promise<void> | undefined;
    protected abortController: AbortController | undefined;
    protected pollingPromise: Promise<void> | undefined;
    stopPollingWaitInterval: number = 200;
    pollRetries: number = 0;
    tracksDiscovered: number = 0;
    tracksDiscoveredTotal: number = 0;
    queuedLength: number = 0;

    queueIdleMs: number = 1000;
    queueConcurrency: number = 3;

    protected isSleeping: boolean = false;
    protected wakeAt: Dayjs = dayjs();

    supportsUpstreamRecentlyPlayed: boolean = false;
    supportsUpstreamNowPlaying: boolean = false;
    supportsManualListening: boolean = false;

    scheduler: ToadScheduler = new ToadScheduler();

    protected SCROBBLE_BACKLOG_COUNT: number = 30;

    protected recentDiscoveredPlays: GroupedFixedPlays = new TupleMap<DeviceId, PlayUserId, FixedSizeList<ProgressAwarePlayObject>>();

    protected loggerLabel: string;

    protected discoveredCounter: Counter;

    declare protected componentType: 'source';

    protected playRepo!: DrizzlePlayRepository;
    protected queueRepo!: DrizzleQueueRepository;
    protected playEventsRepo!: DrizzlePlayEventsRepository;

    protected queuedGauge: Gauge;

    existingDiscoveredPlay: (playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean) => Promise<PlayMatchResult>

    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(config);
        this.componentType = 'source';
        const {clients = [] } = config;
        this.type = type;
        this.name = name;
        this.logger = childLogger(internal.logger, this.getIdentifier());
        this.loggerLabel = this.getIdentifier();
        this.config = config;
        this.clients = clients;
        this.logger.debug(`Scrobble To: ${this.clients.length === 0 ? 'All' : this.clients.join(' | ')}`);
        this.instantiatedAt = dayjs();
        this.lastActivityAt = this.instantiatedAt;
        this.localUrl = internal.localUrl;
        this.configDir = internal.configDir;
        this.emitter = emitter;
        
        const metrics = getRoot().items.sourceMetics;
        this.discoveredCounter = metrics.discovered;
        this.queuedGauge = metrics.queued;

        const existingScrobbleOpts: ExistingScrobbleOpts = {
            logger: this.logger,
            transformRules: this.transformRules,
            transformPlay: this.transformPlay,
            existingSubmitted: async (_) => [undefined, undefined]
        }
        this.existingDiscoveredPlay = (playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean) => existingScrobble(playObjPre, existingScrobbles, existingScrobbleOpts, log);
            
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

    public initTasks() {
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
                    this.logger.error(err);
                    this.errors.push(err);
                }
            ), {id: 'heartbeat'}));
        } else {
            this.logger.verbose('Heartbeat task is already added to scheduler, running immediately instead');
            const j = this.scheduler.getById('heartbeat') as SimpleIntervalJob;
            j.start();
        }
    }

    protected async heartbeatTask(): Promise<boolean> {
        if(!this.isReady()) {
            if(!this.canAuthUnattended()) {
                this.logger.warn({labels: 'Heartbeat'}, 'Source is not ready but will not try to initialize because auth state is not good and cannot be corrected unattended.')
                return false;
            }
            try {
                this.setStatus('Attempting to initialize...');
                await this.initialize({force: false, notify: true, notifyTitle: 'Could not initialize automatically'});
            } catch (e) {
                this.logger.error(new Error('Could not initialize automatically', {cause: e}));
                this.setStatus('Could not initialize automatically');
                return false;
            }

            if('discoverDevices' in this && typeof this.discoverDevices === 'function') {
                this.discoverDevices();
            }
        }
        if(this.isReady()) {
            if(this.discoverQueuePromise === undefined) {
                this.setStatus('Starting discovery queue...');
                await this.startDiscoveryQueue();
            }
            if (this.canPoll && !this.polling) {
                if(!this.canAuthUnattended()) {
                    this.logger.warn({labels: 'Heartbeat'}, 'Should be polling but will not attempt to start because auth state is not good and cannot be correct unattended.');
                    return false;
                } else {
                    this.logger.info({labels: 'Heartbeat'}, 'Should be polling, attempting to start polling...');
                    this.setStatus('Attempting to start polling...');
                    this.poll({force: false, notify: true}).catch(e => this.logger.error(e));
                }
                return true;
            } else if(!this.canPoll) {
                this.updateDates({lastReadyAt: dayjs(), force: true});
            }
        }
        return true;
    }

    public async start(opts: {forceInit?: boolean} = {}) {
        try {
            if (opts.forceInit) {
                if (!this.canAuthUnattended()) {
                    this.logger.warn({ labels: 'Heartbeat' }, 'Source is not ready but will not try to initialize because auth state is not good and cannot be corrected unattended.')
                    return false;
                }
                try {
                    this.setStatus('Attempting to initialize...');
                    await this.initialize({ force: true, notify: true, notifyTitle: 'Could not initialize automatically' });
                } catch (e) {
                    this.logger.error(new Error('Could not initialize automatically', { cause: e }));
                    this.setStatus('Could not initialize automatically');
                    return false;
                }

                if ('discoverDevices' in this && typeof this.discoverDevices === 'function') {
                    this.discoverDevices();
                }
            }
            this.initTasks();

            return true;
        } catch (e) {
            throw new StageChangeError('Failed to start', { cause: e });
        } finally {
            this.emitComponentUpdate({state: this.getRunningState()});
        }
    }

    public async stop(opts: { reason?: string | Error } = {}) {
        try {
            if (this.canPoll) {
                await this.tryStopPolling(opts.reason);
            }
            await this.tryStopDiscoveryQueue(opts.reason);
            this.scheduler.stop();
            for (const job of this.scheduler.getAllJobs()) {
                job.stop();
                this.scheduler.removeById(job.id);
            }
            this.setStatus('Stopped');
            this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({state: COMPONENT_STATE.STOPPED});
        } catch (e) {
            this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({state: this.getRunningState()});
            throw new StageChangeError('Failed to stop', { cause: e });
        }
    }

    protected async postCache(): Promise<void> {
        await super.postCache();
    }

    protected async postDatabase(): Promise<void> {
        this.playRepo = new DrizzlePlayRepository(this.db, {logger: this.logger});
        this.queueRepo = new DrizzleQueueRepository(this.db, {logger: this.logger});
        this.playEventsRepo = new DrizzlePlayEventsRepository(this.db, {logger: this.logger});
        this.playRepo.componentId = this.dbComponent.id;
        this.queueRepo.componentId = this.dbComponent.id;
        const counts = await this.playRepo.getComponentPlayCountByState();
        const discoveredCount = counts.find(x => x.state === 'discovered');
        if(discoveredCount !== undefined) {
            this.tracksDiscoveredTotal = discoveredCount['count(*)'];
        }
    }

    protected async updateQueueStats(queueNames: string[]) {
        if(queueNames.includes(INGRESS_QUEUE)) {
            this.queuedLength = await this.queueRepo.getQueueCount(this.dbComponent.id, [INGRESS_QUEUE]);
            this.queuedGauge.labels(this.getPrometheusLabels()).set(this.queuedLength);
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
        if(this.scheduler.getAllJobs().length === 0) {
            return COMPONENT_STATE.STOPPED;
        }

        const running = (this.canPoll && this.polling) || !this.canPoll;

        if(running && !this.isMonitoring()) {
            return COMPONENT_STATE.MUTED;
        }
        return running ? COMPONENT_STATE.RUNNING : COMPONENT_STATE.IDLE;
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

    public getApiData(): ComponentSourceApiJson {
        return {
            ...super.getApiData(),
            ...this.getComponentApiData(),
            type: this.type,
            status: this.status,
            players: {},
            tracksDiscovered: this.tracksDiscovered,
            sot: SOURCE_SOT.HISTORY,
            supportsUpstreamRecentlyPlayed: this.supportsUpstreamRecentlyPlayed,
            sleeping: this.getIsSleeping(),
            wakeAt: this.wakeAt !== undefined ? this.wakeAt.toISOString() : undefined,
            countLive: this.tracksDiscoveredTotal
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => []

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        throw new Error('Not implemented');
    }

    getUpstreamNowPlaying = async(): Promise<PlayObject[]> => {
        throw new Error('Not implemented');
    }

    // by default if the track was recently played it is valid
    // this is useful for sources where the track doesn't have complete information like Subsonic
    // TODO make this more descriptive? or move it elsewhere
    recentlyPlayedTrackIsValid = (playObj: PlayObject) => true

    queuePlay = async (data: PlayObject | PlayObject[]) => {
        const monitoring = this.getMonitoringStatus();
        const playDatas = (Array.isArray(data) ? data : [data]).map(x => ({...x, meta: {...x.meta, wasMonitored: monitoring.monitoring, seenAt: dayjs()}}));

        const createdQueuedPlays: PlaySelect[] = [];

        await pMap(playDatas, async (queueablePlay) => {
            try {
                // for backlog and history plays we intentionally queue up plays that may have been processed before...
                // ...for backlog we do this to catch any plays that may have been missed during network outage or MS offline or just the source reporting new things
                // ...for history this is entirely how we "discover" new plays: we use MS's existing check logic to see find "new" plays on the same list (of history) that evolves over time
                //
                // for these two cases, for the majority of scenarios, we want to prune already processed plays from hitting the database
                // otherwise we are causing a lot of noise for duped plays IE history polls every minute and we don't want all 100+ already seen plays being persisted as duped every minute.
                if (([PARSED_FROM.history, PARSED_FROM.backlog] as PARSED_FROM_TYPE[]).includes(queueablePlay.meta.parsedFrom)) {
                    // we should be adding Plays to the queue without any transforms
                    // so run on "raw" play input
                    // if we have seen a play with close temporality with the exact input hash then skip it entirely
                    const cheapInputExisting = await this.playRepo.checkExisting(queueablePlay, { inputHash: queueablePlay });
                    if (cheapInputExisting !== undefined) {
                        if (isDebugMode() || PARSED_FROM.backlog === queueablePlay.meta.parsedFrom) {
                            // log to trace for backlog for some visibility into what was pruned
                            // this is fine noise-wise since this only happens when a component it (re)started
                            //
                            // for history we only want to do this if debugmode is enabled
                            // TODO implement debugmode per component so global debug doesn't cause noise if this isn't the component that is being debugged
                            this.logger.trace(`Not adding ${buildTrackString(queueablePlay)} to queue because it already exists in db as Play ${cheapInputExisting.uid}`);
                        }
                        return;
                    }
                }
            } catch (e) {
                this.logger.warn(new SimpleError('Failed to check queued scrobble for existing before adding, will continue with adding anyway', { cause: e }));
            }
            
            // not in queue or existing queued check failed for some reason and we don't want to lose Play
            const {
                data,
                meta
            } = queueablePlay
            const createPlayData = playToRepositoryCreatePlayOpts({
                play: {
                    data,
                    meta
                },
                componentId: this.dbComponent.id, 
                state: 'queued',
            });

            const playRow = await this.playRepo.createPlays([createPlayData]);
            const queueState = await this.queueRepo.create({componentId: this.dbComponent.id, playId: playRow[0].id, queueName: INGRESS_QUEUE}) as QueueStateSelect;
            await this.playEventsRepo.createMany([
                {playId: playRow[0].id, eventName: PLAY_EVENT_TYPE.playStateChange, data: {state: 'queued'}, createdAt: playRow[0].seenAt.add(1,'ms')},
                {playId: playRow[0].id, eventName: PLAY_EVENT_TYPE.queueStateChange, data: queueStateToEventData(queueState), createdAt: queueState.createdAt}
            ]);
            createdQueuedPlays.push(playRow[0]);
            this.logger.debug(`Added ${buildTrackString(queueablePlay)} to the queue`);
            this.emitPlayInsert({...playRow[0], queueStates: [queueState]} as unknown as PlayApiCommonDetailed);
            this.queuedLength += 1;
            this.queuedGauge.labels(this.getPrometheusLabels()).inc();
        });

        return createdQueuedPlays;
    }

    getFlatRecentlyDiscoveredPlays = async (): Promise<PlayObject[]> => {
        const list: PlayObject[] = await this.getRecentlyDiscoveredPlays();
        return list.sort(sortByNewestPlayDate);
    }

    getRecentPlaysApi = async (query: RequestPlayQuery) => {
        const res = await this.playRepo.findPlays({
            limit: 100,
        });
        return res.map((x) => {
            const {id, ...rest} = x;
            return rest;
        })
    }

    protected recentDiscoveredCacheKey = () => {
        return `recentDiscovered-${this.dbComponent.id}`;
    }

    protected recentCacheKey = () => {
        return `recent-${this.dbComponent.id}`;
    }


    getRecentlyDiscoveredPlays = async (hydrate: boolean = true): Promise<PlayObject[]> => {
        const cacheKey = this.recentDiscoveredCacheKey();
        let list = await this.cache.cacheDb.get<PlayObject[]>(cacheKey);
        if(list === undefined && hydrate) {
            list = (await this.playRepo.findPlays({
                state: ['discovered'],
                order: 'desc',
                sort: 'playedAt',
                limit: 200
            })).map(x => ({...asPlay(x.play), id: x.id, uid: x.uid}))
            list.sort(sortByOldestPlayDate);
            await this.cache.cacheDb.set<PlayObject[]>(cacheKey, list, '2m');
        }
        return list;
    }

    getRecentPlays = async (hydrate: boolean = true): Promise<PlayObject[]> => {
        const cacheKey = this.recentCacheKey();
        let list = await this.cache.cacheDb.get<PlayObject[]>(cacheKey);
        if(list === undefined && hydrate) {
            list = (await this.playRepo.findPlays({
                stateNot: ['queued'],
                order: 'desc',
                sort: 'playedAt',
                limit: 200
            })).map(x => ({...asPlay(x.play), id: x.id, uid: x.uid}))
            list.sort(sortByOldestPlayDate);
            await this.cache.cacheDb.set<PlayObject[]>(cacheKey, list, '2m');
        }
        return list;
    }

    async existingDiscovered(play: PlayObject): Promise<PlayMatchResult> {
        const list: PlayObject[] = await this.getRecentPlays(true);
        return await this.existingDiscoveredPlay(play, list);
        // if(matchResults.match) {
        //     return matchResults.closestMatchedPlay;
        // }
        // return undefined;
    }

    protected scrobble = async (newDiscoveredPlays: PlayObject[], options: { forceRefresh?: boolean, [key: string]: any, discoverLocation?: 'backlog' | [key: string] } = {}) => {

        if(newDiscoveredPlays.length > 0) {
            newDiscoveredPlays.sort(sortByOldestPlayDate);
            const postCompareMapped = await pMap(newDiscoveredPlays, async (x) =>  await this.transformPlay(x, TRANSFORM_HOOK.postCompare), {concurrency: 3});
            const events: PlayEvent[] = [];
            for(const p of postCompareMapped) {
                const {lifecycle = []} = p;
                const psLifecycle = lifecycle.filter(x => x.hook === TRANSFORM_HOOK.postCompare);
                if(psLifecycle.length > 0) {
                    events.push({playId: p.id, eventName: PLAY_EVENT_TYPE.transform, createdAt: dayjs(psLifecycle[0].createdAt), data: psLifecycle});
                }
            }
            this.emitEvent('discoveredToScrobble', {
                data: postCompareMapped,
                options: {
                    ...options,
                    checkTime: newDiscoveredPlays[newDiscoveredPlays.length-1].data.playDate.add(2, 'second'),
                    scrobbleFrom: this.getIdentifier(),
                    scrobbleTo: this.clients
                }
            });
            this.setStatus(`Forwarded ${newDiscoveredPlays.length} new Plays to Clients${options.discoverLocation !== undefined ? ` from ${options.discoverLocation} ` : ''}`);
        }
    }

    protected processBacklog = async (signal: AbortSignal) => {
        if (this.canBacklog) {

            const {
                options: {
                    scrobbleBacklog = true
                } = {}
            } = this.config;

            if(scrobbleBacklog === false) {
                this.logger.info('Source is able to scrobble backlog but was it disabled by user.');
                this.setStatus('Not scrobbling backlog because it was disabled by user');
                return;
            }

            this.logger.info('Discovering backlogged tracks from recently played API...');
            this.setStatus('Discovering backlogged tracks from recently played API...');
            let backlogPlays: PlayObject[];
            const {
                scrobbleBacklogCount = this.SCROBBLE_BACKLOG_COUNT
            } = this.config.options || {};
            let backlogLimit = scrobbleBacklogCount;
            if(backlogLimit > this.SCROBBLE_BACKLOG_COUNT) {
                this.logger.warn(`scrobbleBacklogCount (${scrobbleBacklogCount}) cannot be greater than max API limit (${this.SCROBBLE_BACKLOG_COUNT}), reverting to max...`);
                backlogLimit = this.SCROBBLE_BACKLOG_COUNT;
            }
            try {
                this.logger.verbose(`Fetching the last ${backlogLimit}${backlogLimit === this.SCROBBLE_BACKLOG_COUNT ? ' (max) ' : ''} listens to check for backlogging...`);
                backlogPlays = (await this.getBackloggedPlays({limit: backlogLimit})).map((x) => ({...x, meta: {...x.meta, parsedFrom: PARSED_FROM.backlog}}));
                signal.throwIfAborted();
            } catch (e) {
                throw new Error('Error occurred while fetching backlogged plays', {cause: e});
            }
            await this.queuePlay(backlogPlays);
            this.logger.info('Backlog Plays added to discovery queue.');
        }
        return;
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions): Promise<PlayObject[]> => {
        this.logger.debug('Backlogging not implemented');
        return [];
    }

    onPollPreAuthCheck = async (): Promise<boolean> => true

    onPollPostAuthCheck = async (): Promise<boolean> => true

    poll = async (options: {force?: boolean, notify?: boolean} = {}) => {
        const {force = false, notify = false} = options;

        if(this.polling) {
            this.logger.error('Already polling!');
            return;
        }

        if(!this.isReady() || force) {
            try {
                await this.initialize(options);
            } catch (e) {
                const err = new Error('Cannot start polling because Source is not ready', {cause: e});
                this.logger.error(err);
                this.setStatus('Polling Error');
                this.replaceErrors(err, {predicate: (x) => x.message === err.message});
                this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({errors: this.errors});
                if(notify) {
                    await this.notify( {title: `Polling Error`, message: `Cannot start polling because Source is not ready: ${truncateStringToLength(500)(messageWithCausesTruncatedDefault(e))}`, priority: 'error'});
                }
                return;
            }
        }
        if(!(await this.onPollPreAuthCheck())) {
            return;
        }
        if(!(await this.onPollPostAuthCheck())) {
            return;
        }

        this.setStatus('Starting polling...');

        this.abortController = new AbortController();
        this.pollingPromise = spawn(this.abortController.signal, async (signal, { defer, fork }) => {
            defer(async () => {
                this.polling = false;
                this.isSleeping = false;
                this.emitEvent('statusChange', {status: 'Idle'});
                this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({state: COMPONENT_STATE.IDLE});
            });

            fork(async (fSignal) => {
                try {
                    await this.processBacklog(fSignal);
                } catch (e) {
                    throwIfAborted(fSignal);
                    await this.notify({
                        title: `Polling Error`,
                        message: 'Polling interrupted because error occurred while processing backlog.',
                        priority: 'error'
                    });
                    throw new Error('Polling interrupted because error occurred while processing backlog', { cause: e });
                }
            });
            await this.startPolling(signal);
        }).catch((e) => {
            const componentUpdate: Partial<ComponentSourceApiJson> = {
                state: COMPONENT_STATE.IDLE
            };
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Polling stopped', this.abortController.signal);
                this.logger.info(err);
                //this.logger.trace(e);
                componentUpdate.status = 'Polling cancelled';
            } else {
                const err = new Error('Polling stopped with error', { cause: e });
                this.logger.warn(err);
                componentUpdate.status = 'Polling stopped with error';
                this.warnings.push(err);
                componentUpdate.warnings = this.warnings;
            }
            this.emitComponentUpdate<Partial<ComponentSourceApiJson>>(componentUpdate);
        }).finally(() => {
            this.abortController = undefined;
            this.pollingPromise = undefined;
        });
    }

    startPolling = async (signal: AbortSignal) => {
        signal.throwIfAborted();
        // reset poll attempts if already previously run
        this.pollRetries = 0;

        const {
            options: {
                maxPollRetries = 5,
                retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
            }
        } = this.config;

        // can't have negative retries!
        const maxRetries = Math.max(0, maxPollRetries);

        if(this.polling === true) {
            this.logger.warn(`Already polling! Polling needs to be stopped before it can be started`);
            return;
        }

        while (this.pollRetries <= maxRetries) {
            try {
                if(!this.isReady() && this.buildOK) {
                    this.logger.verbose(`Source is no longer ready! Will attempt to reinitialize => Connection OK: ${this.connectionOK} | Auth OK: ${this.authed}`);
                    const init = await this.initialize();
                    if(init === false) {
                        throw new Error('Source failed reinitialization');
                    }
                    signal.throwIfAborted();
                }
                await this.doPolling(signal);
            } catch (e) {
                if(isAbortError(e)) {
                    throw e;
                }
                if (this.pollRetries < maxRetries) {
                    const delayFor = pollingBackoff(this.pollRetries + 1, retryMultiplier);
                    this.logger.info(`Poll retries (${this.pollRetries}) less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay...`);
                    await this.notify({title: `Polling Retry`, message: `Encountered error while polling but retries (${this.pollRetries}) are less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                    this.pollRetries++;
                } else {
                    this.logger.warn(`Poll retries (${this.pollRetries}) equal to max poll retries (${maxRetries}), stopping polling!`);
                    await this.notify({title: `Polling Error`, message: `Encountered error while polling and retries (${this.pollRetries}) are equal to max poll retries (${maxRetries}), stopping polling!. | Error: ${e.message}`, priority: 'error'});
                    throw e;
                }
            }
        }
    }

    tryStopPolling = async (reason?: string | Error) => {
        if(this.polling === false) {
            this.logger.warn(`Polling is already stopped!`);
            return true;
        }
        if(this.abortController === undefined) {
            this.logger.error('No abort controller found! Nothing to stop.');
            return false;
        }
        this.abortController.abort(reason);
        let elapsed = 0;
        while(this.polling && elapsed < (10 * this.stopPollingWaitInterval)) {
            this.logger.verbose(`Waiting for polling stop signal to be acknowledged (waited ${formatNumber(elapsed/1000)}s)`);
            await sleep(this.stopPollingWaitInterval);
            elapsed += this.stopPollingWaitInterval;
        }
        if(this.polling) {
            this.logger.warn('Could not stop polling! Or polling signal was lost :(');
            return false;
        }
        return true;
    }

    protected doPolling = async (signal: AbortSignal): Promise<true | undefined> => {
        signal.throwIfAborted();

        this.logger.info('Polling started');
        this.emitEvent('statusChange', {status: 'Running'});
        this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({state: COMPONENT_STATE.RUNNING});
        await this.notify({title: `Polling Started`, message: 'Polling Started', priority: 'info'});
        this.setStatus('Polling Started');
        this.lastActivityAt = dayjs();
        let checksOverThreshold = 0;
        const checkActiveFor = 120;
        let maxInterval = DEFAULT_POLLING_MAX_INTERVAL;

        if('maxInterval' in this.config.data) {
            maxInterval = this.config.data.maxInterval;
        }
        let isInactive = false;

        try {
            this.polling = true;
            while (true) {
                signal.throwIfAborted();
                const pollFrom = dayjs();
                let lastActivityLogLevel: LogLevel = 'trace';

                let playObjs: PlayObject[];
                try {
                    playObjs = await this.getRecentlyPlayed({formatted: true});
                } catch (e) {
                    throw new Error('Error occurred while refreshing recently played', {cause: e});
                } finally {
                    signal.throwIfAborted();
                }
            

                const interval = this.getInterval(true);
                const maxBackoff = this.getMaxBackoff();
                let sleepTime = interval;

                if(playObjs.length > 0) {
                    const now = dayjs().unix();
                    const closeToInterval = playObjs.some(x => now - x.data.playDate.unix() < 5);
                    if (playObjs.length > 0 && closeToInterval) {
                        // because the interval check was so close to the play date we are going to delay client calls for a few secs
                        // this way we don't accidentally scrobble ahead of any other clients (we always want to be behind so we can check for dups)
                        // additionally -- it should be ok to have this in the for loop because played_at will only decrease (be further in the past) so we should only hit this once, hopefully

                        // make sure delay is less than possible polling interval
                        const maxDelay = Math.min(10, interval * 0.75);
                        this.logger.info(`Potential plays were discovered close to polling interval! Delaying scrobble clients refresh by ${maxDelay} seconds so other clients have time to scrobble first`);
                        await sleep(maxDelay * 1000);
                    }
                    await this.queuePlay(playObjs);
                    //newDiscovered = await this.discover(playObjs, {signal});
                    signal.throwIfAborted();
                    // this.scrobble(newDiscovered,
                    //     {
                    //         forceRefresh: closeToInterval
                    //     });
                }

                const activityMsgs: string[] = [];

                if(playObjs.length > 0) {
                    playObjs.sort(sortByNewestPlayDate);
                    // only update date if the play date is after the current activity date (in the case of backlogged plays)
                    if(playObjs[0].data.playDate.isAfter(this.lastActivityAt)) {
                        this.lastActivityAt = playObjs[0].data.playDate;
                    }
                    checksOverThreshold = 0;
                }

                const activeThreshold = this.lastActivityAt.add(checkActiveFor, 's');
                const inactiveFor = dayjs.duration(Math.abs(activeThreshold.diff(dayjs(), 'millisecond'))).humanize(false);
                const relativeActivity = dayjs.duration(this.lastActivityAt.diff(dayjs(), 'ms'));
                const humanRelativeActivity = relativeActivity.asSeconds() > -3 ? '' : ` (${timeToHumanTimestamp(relativeActivity)} ago)`;
                let friendlyInterval = `${formatNumber(sleepTime)}`;
                const friendlyLastFormat = todayAwareFormat(this.lastActivityAt);
                activityMsgs.push(`Last activity at ${friendlyLastFormat}${humanRelativeActivity}`);
                if (activeThreshold.isBefore(dayjs())) {
                    friendlyInterval = formatNumber(maxInterval);
                    checksOverThreshold++;
                    if(sleepTime < maxInterval) {
                        const checkVal = Math.min(checksOverThreshold, 1000);
                        const backoff = Math.round(Math.max(Math.min(Math.min(checkVal, 1000) * 2 * (1.1 * checkVal), maxBackoff), 5));
                        friendlyInterval = `(${interval} + ${backoff})`;
                        sleepTime = interval + backoff;
                    }
                    if(!isInactive) {
                        lastActivityLogLevel = 'debug';
                        isInactive = true;
                    }
                    activityMsgs.push(`Inactive for ${inactiveFor} (last + ${checkActiveFor}s)`);
                } else if(isInactive) {
                    activityMsgs.push('New Activity after inactive period');
                    lastActivityLogLevel = 'debug';
                    isInactive = false;
                }
                activityMsgs.push(`Next check in ${friendlyInterval}s`);
                this.logger[lastActivityLogLevel](activityMsgs.join(' | '));
                this.setWakeAt(pollFrom.add(sleepTime, 'seconds'));
                this.setIsSleeping(true);
                this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({sleeping: true, wakeAt: this.getWakeAt().toISOString()})
                // set last active before we sleep
                this.updateDates({lastActiveAt: dayjs(), lastReadyAt: dayjs()});
                while(dayjs().isBefore(this.getWakeAt())) {
                    // check for polling status every half second and wait till wake up time
                   await delay(signal, 500);
                }
                this.setIsSleeping(false);
                this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({sleeping: false});
                // if we have made it this far in the loop we can reset poll retries
                this.pollRetries = 0;
            }
        } catch (e) {
            if(!isAbortError(e)) {
                this.logger.error(new Error('Error occurred while polling', {cause: e}));
            }
            if(e.message.includes('Status code: 401')) {
                this.authed = false;
                this.authFailure = true;
            }
            throw e;
        } finally {
            this.setIsSleeping(false);
            this.emitComponentUpdate<Partial<ComponentSourceApiJson>>({sleeping: false});
        }
    }

    startDiscoveryQueue = async () => {
        this.setStatus('Starting discovery queue processing');
        this.discoverQueueAbortController = new AbortController();
        this.discoverQueuePromise = spawn(this.discoverQueueAbortController.signal, async (signal, { defer }) => {
                await this.processDiscoveryQueue(signal);
        }).catch((e) => {
            const componentUpdate: Partial<ComponentSourceApiJson> = {
            };
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Discovery queue processing stopped', this.discoverQueueAbortController.signal);
                this.logger.info(err);
                //this.logger.trace(e);
                componentUpdate.status = 'Discovery queue processing cancelled';
            } else {
                const err = new Error('Scrobble processing stopped with error', { cause: e });
                this.logger.warn(err);
                componentUpdate.status = 'Discovery queue stopped with error';
                this.warnings.push(err);
                componentUpdate.warnings = this.warnings;
            }
            this.emitComponentUpdate<Partial<ComponentSourceApiJson>>(componentUpdate);
        }).finally(() => {
            this.discoverQueueAbortController = undefined;
            this.discoverQueuePromise = undefined;
        });
    }

    tryStopDiscoveryQueue = async (reason?: string | Error) => {
        if(this.discoverQueuePromise === undefined) {
            this.logger.verbose(`Discovery is already stopped`);
            return;
        }
        if(this.discoverQueueAbortController === undefined) {
            this.logger.error('No abort controller found! Nothing to stop.');
            return false;
        }
        this.discoverQueueAbortController.abort(reason)
        let timePasssed = 0;
        while(this.discoverQueuePromise !== undefined && timePasssed < (this.stopPollingWaitInterval * 10)) {
            await sleep(this.stopPollingWaitInterval);
            timePasssed += this.stopPollingWaitInterval;
            this.logger.verbose(`Waiting for discovery processing stop signal to be acknowledged (waited ${timePasssed}ms)`);
        }
        if(this.discoverQueuePromise !== undefined) {
            throw new Error('Could not stop discovery processing! Or signal was lost');
        }
        return true;
    }

    protected processDiscoveryQueue = async (signal: AbortSignal) => {
        signal.throwIfAborted();

        let taskFailures = 0;

        const {
            options: {
                maxRequestRetries = 5,
                retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
            } = {},
        } = this.config;
        const maxRetries = Math.max(0, maxRequestRetries);
        const consumedIds = new Map<string, number>();

         try {
             await consumeQueue(
                 async (queueId) => {
                    const next = await this.playRepo.getQueueNext(INGRESS_QUEUE, {notIds: consumedIds.size === 0 ? undefined : consumedIds.values().toArray()});
                    if(next !== undefined) {
                        consumedIds.set(queueId, next.id);
                    }
                    return next;
                 },
                 async (item) => {
                     if (taskFailures > 0) {
                         const delayFor = pollingBackoff(taskFailures + 1, retryMultiplier);
                         this.logger.debug(`Delaying discovery of Play ${item.uid} task for ${delayFor}ms due to non-zero prior failures (${taskFailures})`);
                         await sleep(delayFor, { signal });
                     }
                     return this.processQueueCurrentPlay(item, signal)
                 },
                 {
                     concurrency: this.queueConcurrency,
                     idleMs: this.queueIdleMs,
                     signal,
                     onSuccess: (item, queueId) => {
                        consumedIds.delete(queueId);
                        taskFailures = Math.max(taskFailures - 1, 0);
                     },
                     onError: async (e: Error, queueId) => {
                        consumedIds.delete(queueId);
                        taskFailures++;
                        this.emitter.emit('discoveryQueueError', e);
                        if(taskFailures < maxRetries) {
                            this.logger.info(`Discovery queue retries (${taskFailures}) less than max processing retries (${maxRetries}), continuing with processing...`);
                            await this.notify({title: `Processing Retry`, message: `Encountered error while polling but retries (${taskFailures}) are less than max poll retries (${maxRetries}) so will continue. Error: ${e.message}`, priority: 'warn'});
                        } else {
                            this.logger.warn(`Discovery queue retries (${taskFailures}) equal to max processing retries (${maxRetries}), stopping processing!`);
                            await this.notify({title: `Processing Error`, message: `Encountered error while scrobble processing and retries (${taskFailures}) are equal to max processing retries (${maxRetries}), stopping processing!. | Error: ${e.message}`, priority: 'error'});
                            throw e;
                        }
                     },
                     onEmpty: () => {
                        this.emitter.emit('queueEmptied');
                     }
                 },
             );
         } catch (e) {
            throw e;
         }

    }

    protected processQueueCurrentPlay = async (currQueuedPlay: PlaySelectWithQueueStates, signal?: AbortSignal) => {
        signal?.throwIfAborted();
        this.setStatus(`Processing Play ${currQueuedPlay.uid}`);

        const queueState = currQueuedPlay.queueStates.find(x => x.queueName === INGRESS_QUEUE);
        const updatedQueueState: Partial<QueueStateNew> = {};
        let state: PlayState;
        const events: Omit<PlayEvent, 'playId'>[] = [];
        try {
            const {lifecycle = [], ...preCompared} = await this.transformPlay(currQueuedPlay.play, TRANSFORM_HOOK.preCompare);
            if(lifecycle.length > 0) {
                events.push({eventName: PLAY_EVENT_TYPE.transform, createdAt: dayjs(lifecycle[0].createdAt), data: lifecycle});
            }
            let existing: PlayObject;
            // cheap check for existing
            const cheapExisting = await this.playRepo.checkExisting(preCompared, { notId: currQueuedPlay.id });
            if(cheapExisting !== undefined) {
                events.push({eventName: PLAY_EVENT_TYPE.dupeCheck, data: {match: true, closestMatchedPlay: cheapExisting.play, score: 1, breakdowns: [], createdAt: dayjs().toISOString(), reason: `Matched hash on existing Play ${cheapExisting.uid} with close temporality`}, createdAt: dayjs()});
                updatedQueueState.error = {message: `Matched hash on existing Play ${cheapExisting.uid} with close temporality`};
                existing = {...cheapExisting.play, id: cheapExisting.id, uid: cheapExisting.uid};
            } else {
                const matchRes = await this.existingDiscovered(preCompared);
                events.push({eventName: PLAY_EVENT_TYPE.dupeCheck, data: matchRes, createdAt: dayjs()});
                if(matchRes.match) {
                    existing = matchRes.closestMatchedPlay;
                    updatedQueueState.error = {message: `Matched with Play ${existing.uid ?? existing.id}`};
                }
            }
            currQueuedPlay.play = preCompared;
            signal?.throwIfAborted();
            if(existing === undefined) {
                if(!preCompared.meta.wasMonitored) {
                    this.logger.debug(`Not adding ${buildTrackString(preCompared)} as discovered because monitoring was disabled when Play was created.`);
                    state = 'discarded';
                    updatedQueueState.error = {message: 'Play was not added as discovered because monitoring was disabled when Play was created.'}
                    events.push({eventName: PLAY_EVENT_TYPE.playStateChange, data: {state, reason: 'Not added as discovered because monitoring was disabled when Play was created'}, createdAt: dayjs()});
                } else {
                    state = 'discovered';
                    events.push({eventName: PLAY_EVENT_TYPE.playStateChange, data: {state}, createdAt: dayjs()});
                    this.tracksDiscovered++;
                    this.tracksDiscoveredTotal++
                    this.discoveredCounter.labels(this.getPrometheusLabels()).inc();
                    this.emitEvent('discovered', {play: preCompared});
                }
            } else {
                this.playRepo.updateById(existing.id, {updatedAt: dayjs()});
                state = 'duped';
                events.push({eventName: PLAY_EVENT_TYPE.playStateChange, data: {state}, createdAt: dayjs()});
                currQueuedPlay.parentId = existing.id;
            }
            this.playRepo.updateById(currQueuedPlay.id, {play: preCompared, state});
            const recentPlays = await this.getRecentPlays(false);
            // only need to update if its already in memory,
            // and better to update in-memory than clear cache so we aren't refetching from db on every discover
            if(recentPlays !== undefined) {
                recentPlays.push({...preCompared, id: currQueuedPlay.id, uid: currQueuedPlay.uid});
                recentPlays.sort(sortByOldestPlayDate);
                this.cache.cacheDb.set(this.recentCacheKey(), recentPlays, '2m');
            }
            if(state === 'discovered') {
                const recentDiscoveredPlays = await this.getRecentlyDiscoveredPlays(false);
                if(recentDiscoveredPlays !== undefined) {
                    recentDiscoveredPlays.push({...preCompared, id: currQueuedPlay.id, uid: currQueuedPlay.uid});
                    recentDiscoveredPlays.sort(sortByOldestPlayDate);
                    this.cache.cacheDb.set(this.recentDiscoveredCacheKey(), recentDiscoveredPlays, '2m');
                }
            }
            updatedQueueState.queueStatus = 'completed';
            events.push({eventName: PLAY_EVENT_TYPE.queueStateChange, data: queueStateToEventData({...queueState, ...updatedQueueState}), createdAt: dayjs()});

            this.logger.info(`${capitalize(state)} => ${buildTrackString(preCompared)}`);
        } catch (e) {
            const err = new Error(`Error ocurred while trying to discover Play ${currQueuedPlay.uid}`, {cause: e});
            updatedQueueState.error = err;
            updatedQueueState.queueStatus = 'failed';
            events.push({eventName: PLAY_EVENT_TYPE.queueStateChange, data: queueStateToEventData({...queueState, ...updatedQueueState}), createdAt: dayjs()});
        } finally {
            await this.queueRepo.updateById(queueState.id, updatedQueueState);
            await this.playEventsRepo.createMany(events.map(x => ({...x, playId: currQueuedPlay.id})));
        }

        if(state === 'discovered') {
            await this.scrobble([{...currQueuedPlay.play, id: currQueuedPlay.id, uid: currQueuedPlay.uid}]);
        }
        return currQueuedPlay;
    }

    protected setIsSleeping(sleeping: boolean) {
        this.isSleeping = sleeping;
    }

    protected getIsSleeping() {
        return this.isSleeping;
    }

    protected setWakeAt(dt: Dayjs) {
        this.wakeAt = dt;
    }

    protected getWakeAt() {
        return this.wakeAt;
    }

    protected getInterval(log?: boolean) {
        let interval = DEFAULT_POLLING_INTERVAL;

        if('interval' in this.config.data) {
            interval = this.config.data.interval;
        }
        return interval;
    }

    protected getMaxBackoff() {
        let maxInterval = DEFAULT_POLLING_MAX_INTERVAL;

        if('maxInterval' in this.config.data) {
            maxInterval = this.config.data.maxInterval;
        }
        return maxInterval - this.getInterval();
    }

    public async getPlaysPaginated(args: QueryPlaysOpts): Promise<PaginatedResponse<PlayApiCommonDetailed>> {
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

    public emitEvent = (eventName: string, payload: object = {}) => {
        this.emitter.emit(eventName, {
            type: this.type,
            name: this.name,
            componentId: this.dbComponent?.id,
            from: 'source',
            data: payload,
        });
    }

    public async destroy() {
        this.emitter.removeAllListeners();
    }

    protected async doBuildComponentLogger(): Promise<void> {
        if(this.config?.options?.logToFile) {
            this.logger.debug('Enabling component logger...');
            const root = getRoot();
            const stream = root.get('loggerStream');
            const logConfig = root.get('loggingConfig');
            const cLogger = await componentFileLogger(this.type, this.name, true, logConfig);
            this.componentLogger = childLogger(cLogger, this.logger.labels);
            stream.on('data', (d: LogDataPretty) => {
                const {level, msg, line, labels, ...rest} = d;
                if(d.labels.includes(this.loggerLabel)) {
                    this.componentLogger[this.componentLogger.levels.labels[d.level]]({...rest, labels: difference(labels, this.logger.labels)}, msg);
                }
            });
        }
    }
}
