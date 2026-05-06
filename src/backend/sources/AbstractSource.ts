import { childLogger, LogDataPretty, LogLevel } from '@foxxmd/logging';
import dayjs, { Dayjs } from "dayjs";
import { EventEmitter } from "events";
import { FixedSizeList } from "fixed-size-list";
import { JsonPlayObject, PlayMatchResult, PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.js";
import AbstractComponent from "../common/AbstractComponent.js";
import {
    Authenticatable,
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_POLLING_MAX_INTERVAL,
    DEFAULT_RETRY_MULTIPLIER,
    DeviceId,
    GroupedFixedPlays,
    InternalConfig,
    NO_USER,
    PlayPlatformId,
    PlayUserId,
    ProgressAwarePlayObject,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import { SourceType, SourceConfig } from '../common/infrastructure/config/source/sources.js';
import { TRANSFORM_HOOK } from "../common/infrastructure/Transform.js";
import TupleMap from "../common/TupleMap.js";
import {
    difference,
    genGroupId,
    isDebugMode,
    playObjDataMatch,
    pollingBackoff,
    sleep,
    sortByOldestPlayDate,
} from "../utils.js";
import { genGroupIdStr, sortByNewestPlayDate } from '../../core/PlayUtils.js';
import { formatNumber } from '../../core/DataUtils.js';
import { timeToHumanTimestamp } from "../../core/TimeUtils.js";
import { todayAwareFormat } from "../../core/TimeUtils.js";
import { getRoot } from '../ioc.js';
import { componentFileLogger } from '../common/logging.js';
import { WebhookPayload } from '../common/infrastructure/config/health/webhooks.js';
import { isAbortReasonErrorLike, messageWithCauses, messageWithCausesTruncatedDefault } from '../utils/ErrorUtils.js';
import { existingScrobble, ExistingScrobbleOpts, genericSourcePlayMatch } from '../utils/PlayComparisonUtils.js';
import { findAsync, staggerMapper, StaggerOptions } from '../utils/AsyncUtils.js';
import pMap, {pMapIterable} from 'p-map';
import prom, { Counter, Gauge } from 'prom-client';
import { normalizeStr } from '../utils/StringUtils.js';
import { spawn, catchAbortError, isAbortError, rethrowAbortError, delay, forever, AbortError, throwIfAborted } from 'abort-controller-x';
import { AbortedError, generateLoggableAbortReason } from '../common/errors/MSErrors.js';
import { DrizzlePlayRepository, playToRepositoryCreatePlayOpts, queryArgsFromRequest, QueryPlaysOpts, RequestPlayQuery } from '../common/database/drizzle/repositories/PlayRepository.js';
import { asPlay } from '../../core/PlayMarshalUtils.js';

export interface RecentlyPlayedOptions {
    limit?: number
    formatted?: boolean

    display?: boolean
}

export default abstract class AbstractSource extends AbstractComponent implements Authenticatable {

    name: string;
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
    protected abortController: AbortController | undefined;
    protected pollingPromise: Promise<void> | undefined;
    stopPollingWaitInterval: number = 200;
    pollRetries: number = 0;
    tracksDiscovered: number = 0;

    protected isSleeping: boolean = false;
    protected wakeAt: Dayjs = dayjs();

    supportsUpstreamRecentlyPlayed: boolean = false;
    supportsUpstreamNowPlaying: boolean = false;
    supportsManualListening: boolean = false;

    manualListening?: boolean

    emitter: EventEmitter;

    protected SCROBBLE_BACKLOG_COUNT: number = 30;

    protected recentDiscoveredPlays: GroupedFixedPlays = new TupleMap<DeviceId, PlayUserId, FixedSizeList<ProgressAwarePlayObject>>();

    protected loggerLabel: string;

    protected discoveredCounter: Counter;

    protected staggerMappers = {
        preCompare: staggerMapper<PlayObject, PlayObject>({concurrency: 2}),
        postCompare: staggerMapper<PlayObject, PlayObject>({concurrency: 2})
    }

    declare protected componentType: 'source';

    protected playRepo: DrizzlePlayRepository;

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
        this.instantiatedAt = dayjs();
        this.lastActivityAt = this.instantiatedAt;
        this.localUrl = internal.localUrl;
        this.configDir = internal.configDir;
        this.emitter = emitter;
        
        this.discoveredCounter = getRoot().items.sourceMetics.discovered;
        this.playRepo = new DrizzlePlayRepository(this.db, {logger: this.logger});

        const existingScrobbleOpts: ExistingScrobbleOpts = {
            logger: this.logger,
            transformRules: this.transformRules,
            transformPlay: this.transformPlay,
            existingSubmitted: async (_) => [undefined, undefined]
        }
        this.existingDiscoveredPlay = (playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean) => existingScrobble(playObjPre, existingScrobbles, existingScrobbleOpts, log);
            
    }

    async [Symbol.asyncDispose]() {
        if(this.canPoll) {
            await this.tryStopPolling('Source is being disposed');
        }
    }

    protected async postCache(): Promise<void> {
        await super.postCache();
        this.generateStaggerMappers();
    }

    protected async postDatabase(): Promise<void> {
        this.tracksDiscovered = this.dbComponent.countLive;
        this.playRepo.componentId = this.dbComponent.id;
    }

    protected generateStaggerMappers() {
        const {
            preCompare = [],
            postCompare = [],
        } = this.transformRules;

        if (preCompare.length > 0) {
            let pcInits: number[] = [0],
                pcMaxStagger: number[] = [0];
            for (const hook of this.transformRules.preCompare) {
                const t = this.transformManager.getTransformerByStage({ type: hook.type, name: hook.name });
                pcInits.push(t.staggerOpts?.initialInterval ?? 0);
                pcMaxStagger.push(t.staggerOpts?.maxRandomStagger ?? 0)
            }
            this.staggerMappers.preCompare = staggerMapper<PlayObject, PlayObject>({ initialInterval: Math.max(...pcInits), maxRandomStagger: Math.max(...pcMaxStagger), concurrency: 2 });
        }

        if (postCompare.length > 0) {
            let postInits: number[] = [0],
                postMaxStagger: number[] = [0];
            for (const hook of this.transformRules.postCompare) {
                const t = this.transformManager.getTransformerByStage({ type: hook.type, name: hook.name });
                postInits.push(t.staggerOpts?.initialInterval ?? 0);
                postMaxStagger.push(t.staggerOpts?.maxRandomStagger ?? 0)
            }
            this.staggerMappers.postCompare = staggerMapper<PlayObject, PlayObject>({ initialInterval: Math.max(...postInits), maxRandomStagger: Math.max(...postMaxStagger), concurrency: 2 });
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

    getSystemListeningBehavior = (): boolean | undefined => {
        if(this.supportsManualListening) {
            return this.config.options !== undefined && 'systemScrobble' in this.config.options ? this.config.options?.systemScrobble : undefined;
        }
        return undefined;
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

    protected addPlayToDiscovered = async (play: PlayObject): Promise<PlayObject> => {
        const playRow = await this.playRepo.createPlays([(playToRepositoryCreatePlayOpts({play, state: 'discovered'}))]);
        const recentPlays = await this.getRecentlyDiscoveredPlays(false);
        // only need to update if its already in memory,
        // and better to update in-memory than clear cache so we aren't refetching from db on every discover
        if(recentPlays !== undefined) {
            recentPlays.push(play);
            recentPlays.sort(sortByOldestPlayDate);
            this.cache.cacheDb.set(this.recentDiscoveredCacheKey(), recentPlays, '2m');
        }
        this.tracksDiscovered++;
        this.logger.info(`Discovered => ${buildTrackString(play)}`);
        this.emitEvent('discovered', {play});
        this.discoveredCounter.labels(this.getPrometheusLabels()).inc();
        play.id = playRow[0].id;
        play.uid = playRow[0].uid;
        return play;
    }

    getFlatRecentlyDiscoveredPlays = async (): Promise<PlayObject[]> => {
        const list: PlayObject[] = await this.getRecentlyDiscoveredPlays();
        return list.sort(sortByNewestPlayDate);
    }

    getRecentPlaysApi = async (query: RequestPlayQuery) => {
        const res = await this.playRepo.findPlays({
            limit: 100,
            ...queryArgsFromRequest(query)
        });
        return res.map((x) => {
            const {id, ...rest} = x;
            return rest;
        })
    }

    protected recentDiscoveredCacheKey = () => {
        return `recent-${this.dbComponent.id}`;
    }

    getRecentlyDiscoveredPlays = async (hydrate: boolean = true): Promise<PlayObject[]> => {
        const cacheKey = this.recentDiscoveredCacheKey();
        let list = await this.cache.cacheDb.get<PlayObject[]>(cacheKey);
        if(list === undefined && hydrate) {
            list = (await this.playRepo.findPlays({
                stateNot: ['queued'],
                order: 'desc',
                sort: 'playedAt',
                limit: 200
            })).map(x => asPlay(x.play))
            list.sort(sortByOldestPlayDate);
            await this.cache.cacheDb.set<PlayObject[]>(cacheKey, list, '2m');
        }
        return list;
    }

    existingDiscovered = async (play: PlayObject): Promise<PlayObject | undefined> => {
        const list: PlayObject[] = await this.getRecentlyDiscoveredPlays();
        const matchResults = await this.existingDiscoveredPlay(play, list);
        if(matchResults.match) {
            return matchResults.closestMatchedPlay;
        }
        return undefined;
    }

    discover = async (plays: PlayObject[], options: { checkAll?: boolean, signal?: AbortSignal, [key: string]: any } = {}): Promise<PlayObject[]> => {
        const newDiscoveredPlays: PlayObject[] = [];

        for await(const play of pMapIterable(plays, this.staggerMappers.preCompare(async x => await this.transformPlay(x, TRANSFORM_HOOK.preCompare)), {concurrency: 3})) {
            options.signal?.throwIfAborted();
            const existing = await this.existingDiscovered(play);
            if(existing === undefined) {
                options.signal?.throwIfAborted()
                const hydratedPlay = await this.addPlayToDiscovered(play);
                newDiscoveredPlays.push(hydratedPlay);
            } else {
                this.playRepo.updateById(existing.id, {updatedAt: dayjs()});
            }
        }
        if(newDiscoveredPlays.length > 0) {
            try {
                await this.componentRepo.updateById(this.dbComponent.id, {countLive: this.dbComponent.countLive + newDiscoveredPlays.length});
            } catch (e) {
                this.logger.warn(new Error('Unable to update discovered count', {cause: e}));
            }
        }
        newDiscoveredPlays.sort(sortByOldestPlayDate);

        return newDiscoveredPlays;
    }

    protected shouldScrobble = (discoverLocation?: 'backlog' | [key: string]) => {
        if(this.supportsManualListening && discoverLocation !== 'backlog') {
            const manualFlag = this.manualListening ?? this.getSystemListeningBehavior() ?? true;
            if(manualFlag === false) {
                this.logger.debug(`NOT scrobbling because Should Scrobble is FALSE (${this.manualListening === false ? 'user' : 'system'})`);
                return false;
            }
        }
        return true;
    }


    protected scrobble = async (newDiscoveredPlays: PlayObject[], options: { forceRefresh?: boolean, [key: string]: any, discoverLocation?: 'backlog' | [key: string] } = {}) => {

        if(newDiscoveredPlays.length > 0) {
            if(!this.shouldScrobble(options.discoverLocation)) {
                await this.playRepo.setStateById('discarded', newDiscoveredPlays.map(x => x.id));
                return;
            }
            newDiscoveredPlays.sort(sortByOldestPlayDate);
            this.emitter.emit('discoveredToScrobble', {
                data: await pMap(newDiscoveredPlays, this.staggerMappers.postCompare(async (x) =>  await this.transformPlay(x, TRANSFORM_HOOK.postCompare)), {concurrency: 3}),
                options: {
                    ...options,
                    checkTime: newDiscoveredPlays[newDiscoveredPlays.length-1].data.playDate.add(2, 'second'),
                    scrobbleFrom: this.getIdentifier(),
                    scrobbleTo: this.clients
                }
            });
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
                return;
            }

            this.logger.info('Discovering backlogged tracks from recently played API...');
            let backlogPlays: PlayObject[] = [];
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
                backlogPlays = await this.getBackloggedPlays({limit: backlogLimit});
                signal.throwIfAborted();
            } catch (e) {
                throw new Error('Error occurred while fetching backlogged plays', {cause: e});
            }
            const discovered = await this.discover(backlogPlays, {discoverLocation: 'backlog', signal});

            if (scrobbleBacklog) {
                if (discovered.length > 0) {
                    this.logger.info('Scrobbling backlogged tracks...');
                    signal.throwIfAborted();
                    await this.scrobble(discovered);
                    this.logger.info('Backlog scrobbling complete.');
                } else {
                    this.logger.info('All tracks already discovered!');
                }
            } else {
                this.logger.info('Backlog scrobbling is disabled by config, skipping...');
            }
        }
        return;
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions): Promise<PlayObject[]> => {
        this.logger.debug('Backlogging not implemented');
        return [];
    }

    public notify = async (payload: WebhookPayload) => {
        this.emitter.emit('notify', payload);
    }

    onPollPreAuthCheck = async (): Promise<boolean> => true

    onPollPostAuthCheck = async (): Promise<boolean> => true

    poll = async (options: {force?: boolean, notify?: boolean} = {}) => {
        const {force = false, notify = false} = options;

        if(this.polling) {
            this.logger.error('Already polling!');
            return;
        }

        // TODO refactor to only use tryInitialize
        if(!this.isReady() || force) {
            try {
                await this.tryInitialize(options);
            } catch (e) {
                this.logger.error(new Error('Cannot start polling because Source is not ready', {cause: e}));
                if(notify) {
                    await this.notify( {title: `${this.getIdentifier()} - Polling Error`, message: `Cannot start polling because Source is not ready: ${truncateStringToLength(500)(messageWithCausesTruncatedDefault(e))}`, priority: 'error'});
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

        this.abortController = new AbortController();
        this.pollingPromise = spawn(this.abortController.signal, async (signal, { defer, fork }) => {
            defer(async () => {
                this.polling = false;
                this.isSleeping = false;
                this.emitEvent('statusChange', {status: 'Idle'});
            });

            fork(async (fSignal) => {
                try {
                    await this.processBacklog(fSignal);
                } catch (e) {
                    throwIfAborted(fSignal);
                    await this.notify({
                        title: `${this.getIdentifier()} - Polling Error`,
                        message: 'Polling interrupted because error occurred while processing backlog.',
                        priority: 'error'
                    });
                    throw new Error('Polling interrupted because error occurred while processing backlog', { cause: e });
                }
            });
            await this.startPolling(signal);
        }).catch((e) => {
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Polling stopped', this.abortController.signal);
                this.logger.info(err);
                this.logger.trace(e)
            } else {
                this.logger.warn(new Error('Polling stopped with error', { cause: e }));
            }
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
                    await this.notify({title: `${this.getIdentifier()} - Polling Retry`, message: `Encountered error while polling but retries (${this.pollRetries}) are less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                    this.pollRetries++;
                } else {
                    this.logger.warn(`Poll retries (${this.pollRetries}) equal to max poll retries (${maxRetries}), stopping polling!`);
                    await this.notify({title: `${this.getIdentifier()} - Polling Error`, message: `Encountered error while polling and retries (${this.pollRetries}) are equal to max poll retries (${maxRetries}), stopping polling!. | Error: ${e.message}`, priority: 'error'});
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
        let lastlog: Dayjs;
        while(this.polling && elapsed < (10 * this.stopPollingWaitInterval)) {
            if(lastlog === undefined || dayjs().diff(lastlog, 's') >= 2) {
                this.logger.verbose(`Waiting for polling stop signal to be acknowledged (waited ${formatNumber(elapsed/1000)}s)`);
            }
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
        await this.notify({title: `${this.getIdentifier()} - Polling Started`, message: 'Polling Started', priority: 'info'});
        this.lastActivityAt = dayjs();
        let checkCount = 0;
        let checksOverThreshold = 0;
        let checkActiveFor = 120;
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

                let newDiscovered: PlayObject[] = [];

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
                    newDiscovered = await this.discover(playObjs, {signal});
                    signal.throwIfAborted();
                    this.scrobble(newDiscovered,
                        {
                            forceRefresh: closeToInterval
                        });
                }

                const activityMsgs: string[] = [];

                if(newDiscovered.length > 0) {
                    // only update date if the play date is after the current activity date (in the case of backlogged plays)
                    this.lastActivityAt = newDiscovered[0].data.playDate.isAfter(this.lastActivityAt) ? newDiscovered[0].data.playDate : this.lastActivityAt;
                    checkCount = 0;
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
                while(dayjs().isBefore(this.getWakeAt())) {
                    // check for polling status every half second and wait till wake up time
                   await delay(signal, 500);
                }
                this.setIsSleeping(false);
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
        }
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

    public getPlays = (args: QueryPlaysOpts) => {
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

    public emitEvent = (eventName: string, payload: object = {}) => {
        this.emitter.emit(eventName, {
            type: this.type,
            name: this.name,
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
