import { childLogger, LogDataPretty } from '@foxxmd/logging';
import dayjs, { Dayjs } from "dayjs";
import { EventEmitter } from "events";
import { FixedSizeList } from "fixed-size-list";
import { PlayObject, TA_CLOSE } from "../../core/Atomic.js";
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
    SourceType, TRANSFORM_HOOK,
} from "../common/infrastructure/Atomic.js";
import { SourceConfig } from "../common/infrastructure/config/source/sources.js";
import TupleMap from "../common/TupleMap.js";
import {
    difference,
    formatNumber,
    genGroupId,
    isDebugMode,
    playObjDataMatch,
    pollingBackoff,
    sleep,
    sortByNewestPlayDate,
    sortByOldestPlayDate,
} from "../utils.js";
import { comparePlayTemporally, temporalAccuracyIsAtLeast, timeToHumanTimestamp, todayAwareFormat } from "../utils/TimeUtils.js";
import { getRoot } from '../ioc.js';
import { componentFileLogger } from '../common/logging.js';
import { WebhookPayload } from '../common/infrastructure/config/health/webhooks.js';
import { messageWithCauses, messageWithCausesTruncatedDefault } from '../utils/ErrorUtils.js';

export interface RecentlyPlayedOptions {
    limit?: number
    formatted?: boolean

    display?: boolean
}

export default abstract class AbstractSource extends AbstractComponent implements Authenticatable {

    name: string;
    type: SourceType;

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
    userPollingStopSignal: undefined | any;
    pollRetries: number = 0;
    tracksDiscovered: number = 0;

    protected isSleeping: boolean = false;
    protected wakeAt: Dayjs = dayjs();

    supportsUpstreamRecentlyPlayed: boolean = false;
    supportsUpstreamNowPlaying: boolean = false;

    emitter: EventEmitter;

    protected SCROBBLE_BACKLOG_COUNT: number = 20;

    protected recentDiscoveredPlays: GroupedFixedPlays = new TupleMap<DeviceId, PlayUserId, FixedSizeList<ProgressAwarePlayObject>>();

    protected loggerLabel: string;

    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(config);
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
    }

    protected getIdentifier() {
        return `${capitalize(this.type)} - ${this.name}`
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

    protected addPlayToDiscovered = (play: PlayObject) => {
        const platformId = this.multiPlatform ? genGroupId(play) : SINGLE_USER_PLATFORM_ID;
        const list = this.recentDiscoveredPlays.get(platformId) ?? new FixedSizeList<ProgressAwarePlayObject>(30);
        list.add(play);
        this.recentDiscoveredPlays.set(platformId, list);
        this.tracksDiscovered++;
        this.logger.info(`Discovered => ${buildTrackString(play)}`);
        this.emitEvent('discovered', {play});
    }

    getFlatRecentlyDiscoveredPlays = (): PlayObject[] =>
         Array.from(this.recentDiscoveredPlays.values()).map(x => x.data).flat(3).sort(sortByNewestPlayDate)
    

    getRecentlyDiscoveredPlaysByPlatform = (platformId: PlayPlatformId): PlayObject[] => {
        const list = this.recentDiscoveredPlays.get(platformId);
        if (list !== undefined) {
            const data = [...list.data];
            data.sort(sortByOldestPlayDate);
            return data;
        }
        return [];
    }

    existingDiscovered = (play: PlayObject, opts: {checkAll?: boolean} = {}): PlayObject | undefined => {
        const lists: PlayObject[][] = [];
        if(opts.checkAll !== true) {
            lists.push(this.getRecentlyDiscoveredPlaysByPlatform(this.multiPlatform ? genGroupId(play) : SINGLE_USER_PLATFORM_ID));
        } else {
            // get as many as we can, optionally filtering by user
            this.recentDiscoveredPlays.forEach((list, platformId) => {
                if(play.meta.user !== undefined) {
                    if(platformId[1] === NO_USER || platformId[1] === play.meta.user) {
                        lists.push(this.getRecentlyDiscoveredPlaysByPlatform(platformId));
                    }
                } else {
                    lists.push(this.getRecentlyDiscoveredPlaysByPlatform(platformId));
                }
            });
        }
        const candidate = this.transformPlay(play, TRANSFORM_HOOK.candidate);
        for(const list of lists) {
            const existing = list.find(x => {
                const e = this.transformPlay(x, TRANSFORM_HOOK.existing);
                return playObjDataMatch(e, candidate) && temporalAccuracyIsAtLeast(TA_CLOSE, comparePlayTemporally(e, candidate).match)
            });
            if(existing) {
                return existing;
            }
        }
        return undefined;
        //const list = this.getRecentlyDiscoveredPlaysByPlatform(this.multiPlatform ? genGroupId(play) : SINGLE_USER_PLATFORM_ID);
        //return list.find(x => playObjDataMatch(x, play) && closePlayDate(x, play));
    }

    alreadyDiscovered = (play: PlayObject, opts: {checkAll?: boolean} = {}): boolean => {
        const existing = this.existingDiscovered(play, opts);
        return existing !== undefined;
    }

    discover = (plays: PlayObject[], options: { checkAll?: boolean, [key: string]: any } = {}): PlayObject[] => {
        const newDiscoveredPlays: PlayObject[] = [];

        const transformedPlayed = plays.map(x => this.transformPlay(x, TRANSFORM_HOOK.preCompare));

        for(const play of transformedPlayed) {
            if(!this.alreadyDiscovered(play, options)) {
                this.addPlayToDiscovered(play);
                newDiscoveredPlays.push(play);
            }
        }

        newDiscoveredPlays.sort(sortByOldestPlayDate);

        return newDiscoveredPlays;
    }


    protected scrobble = (newDiscoveredPlays: PlayObject[], options: { forceRefresh?: boolean, [key: string]: any } = {}) => {

        if(newDiscoveredPlays.length > 0) {
            newDiscoveredPlays.sort(sortByOldestPlayDate);
            this.emitter.emit('discoveredToScrobble', {
                data: newDiscoveredPlays.map(x => this.transformPlay(x, TRANSFORM_HOOK.postCompare)),
                options: {
                    ...options,
                    checkTime: newDiscoveredPlays[newDiscoveredPlays.length-1].data.playDate.add(2, 'second'),
                    scrobbleFrom: this.getIdentifier(),
                    scrobbleTo: this.clients
                }
            });
        }
    }

    protected processBacklog = async () => {
        if (this.canBacklog) {
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
            } catch (e) {
                throw new Error('Error occurred while fetching backlogged plays', {cause: e});
            }
            const discovered = this.discover(backlogPlays);

            const {
                options: {
                    scrobbleBacklog = true
                } = {}
            } = this.config;

            if (scrobbleBacklog) {
                if (discovered.length > 0) {
                    this.logger.info('Scrobbling backlogged tracks...');
                    this.scrobble(discovered);
                    this.logger.info('Backlog scrobbling complete.');
                } else {
                    this.logger.info('All tracks already discovered!');
                }
            } else {
                this.logger.info('Backlog scrobbling is disabled by config, skipping...');
            }
        }
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
        try {
            await this.processBacklog();
        } catch (e) {
            this.logger.error(new Error('Cannot start polling because error occurred while processing backlog', {cause: e}));
            await this.notify({
                title: `${this.getIdentifier()} - Polling Error`,
                message: 'Cannot start polling because error occurred while processing backlog.',
                priority: 'error'
            });
            return;
        }

        await this.startPolling();
    }

    startPolling = async () => {
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

        let pollRes: boolean | undefined = undefined;
        while (pollRes === undefined && this.pollRetries <= maxRetries) {
            try {
                if(!this.isReady() && this.buildOK) {
                    this.logger.verbose(`Source is no longer ready! Will attempt to reinitialize => Connection OK: ${this.connectionOK} | Auth OK: ${this.authed}`);
                    const init = await this.initialize();
                    if(init === false) {
                        throw new Error('Source failed reinitialization');
                    }
                }
                pollRes = await this.doPolling();
                if(pollRes === true) {
                    break;
                }
            } catch (e) {
                if (this.pollRetries < maxRetries) {
                    const delayFor = pollingBackoff(this.pollRetries + 1, retryMultiplier);
                    this.logger.info(`Poll retries (${this.pollRetries}) less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay...`);
                    await this.notify({title: `${this.getIdentifier()} - Polling Retry`, message: `Encountered error while polling but retries (${this.pollRetries}) are less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Poll retries (${this.pollRetries}) equal to max poll retries (${maxRetries}), stopping polling!`);
                    await this.notify({title: `${this.getIdentifier()} - Polling Error`, message: `Encountered error while polling and retries (${this.pollRetries}) are equal to max poll retries (${maxRetries}), stopping polling!. | Error: ${e.message}`, priority: 'error'});
                }
                this.pollRetries++;
            }
        }
    }

    tryStopPolling = async () => {
        if(this.polling === false) {
            this.logger.warn(`Polling is already stopped!`);
            return;
        }
        this.userPollingStopSignal = true;
        let secsPassed = 0;
        while(this.userPollingStopSignal !== undefined && secsPassed < 10) {
            await sleep(2000);
            secsPassed += 2;
            this.logger.verbose(`Waiting for polling stop signal to be acknowledged (waited ${secsPassed}s)`);
        }
        if(this.userPollingStopSignal !== undefined) {
            this.logger.warn('Could not stop polling! Or polling signal was lost :(');
            return false;
        }
        return true;
    }

    protected doStopPolling = (reason: string = 'system') => {
        this.polling = false;
        this.userPollingStopSignal = undefined;
        this.emitEvent('statusChange', {status: 'Idle'});
        this.logger.info(`Stopped polling due to: ${reason}`);
    }

    protected shouldStopPolling = () => this.polling === false || this.userPollingStopSignal !== undefined;

    protected doPolling = async (): Promise<true | undefined> => {
        if (this.polling === true) {
            return true;
        }
        this.logger.info('Polling started');
        this.emitEvent('statusChange', {status: 'Running'});
        await this.notify({title: `${this.getIdentifier()} - Polling Started`, message: 'Polling Started', priority: 'info'});
        this.lastActivityAt = dayjs();
        let checkCount = 0;
        let checksOverThreshold = 0;

        const {checkActiveFor = 300, maxInterval = DEFAULT_POLLING_MAX_INTERVAL} = this.config.data;

        try {
            this.polling = true;
            while (!this.shouldStopPolling()) {
                const pollFrom = dayjs();

                let playObjs: PlayObject[];
                try {
                    playObjs = await this.getRecentlyPlayed({formatted: true});
                } catch (e) {
                    throw new Error('Error occurred while refreshing recently played', {cause: e});
                }
            

                const interval = this.getInterval();
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
                    newDiscovered = this.discover(playObjs);
                    this.scrobble(newDiscovered,
                        {
                            forceRefresh: closeToInterval
                        });
                }

                const debugMsgs: string[] = [];

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
                let friendlyInterval = '';
                const friendlyLastFormat = todayAwareFormat(this.lastActivityAt);
                if (activeThreshold.isBefore(dayjs())) {
                    friendlyInterval = formatNumber(maxInterval);
                    checksOverThreshold++;
                    if(sleepTime < maxInterval) {
                        const checkVal = Math.min(checksOverThreshold, 1000);
                        const backoff = Math.round(Math.max(Math.min(Math.min(checkVal, 1000) * 2 * (1.1 * checkVal), maxBackoff), 5));
                        friendlyInterval = `(${interval} + ${backoff})`;
                        sleepTime = interval + backoff;
                    }
                    if(isDebugMode()) {
                        debugMsgs.push(`Last activity ${friendlyLastFormat}${humanRelativeActivity} is ${inactiveFor} outside of polling period (last activity + ${checkActiveFor}s)`);
                    } else {
                        debugMsgs.push(`Last activity was at ${friendlyLastFormat}${humanRelativeActivity}`);
                    }
                } else {
                    debugMsgs.push(`Last activity was at ${friendlyLastFormat}${humanRelativeActivity}`);
                    friendlyInterval = `${formatNumber(sleepTime)}s`;
                }
                debugMsgs.push(`Next check in ${friendlyInterval}`);
                if(newDiscovered.length === 0) {
                    debugMsgs.push('No new tracks discovered');
                }
                this.logger.debug(debugMsgs.join(' | '));
                this.setWakeAt(pollFrom.add(sleepTime, 'seconds'));
                this.setIsSleeping(true);
                while(!this.shouldStopPolling() && dayjs().isBefore(this.getWakeAt())) {
                    // check for polling status every half second and wait till wake up time
                    await sleep(500);
                }
                this.setIsSleeping(false);

            }
            if(this.shouldStopPolling()) {
                this.doStopPolling(this.userPollingStopSignal !== undefined ?  'user input' : undefined);
                return true;
            }
        } catch (e) {
            this.logger.error(new Error('Error occurred while polling', {cause: e}));
            if(e.message.includes('Status code: 401')) {
                this.authed = false;
                this.authFailure = true;
            }
            this.emitEvent('statusChange', {status: 'Idle'});
            this.polling = false;
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

    protected getInterval() {
        const {interval = DEFAULT_POLLING_INTERVAL} = this.config.data;
        return interval;
    }

    protected getMaxBackoff() {
        const {interval = DEFAULT_POLLING_INTERVAL, maxInterval = DEFAULT_POLLING_MAX_INTERVAL} = this.config.data;
        return maxInterval - interval;
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
        if(this.config.options.logToFile) {
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
