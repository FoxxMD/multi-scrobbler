import dayjs, {Dayjs} from "dayjs";
import {
    genGroupId,
    genGroupIdStrFromPlay,
    mergeArr,
    playObjDataMatch,
    pollingBackoff,
    sleep,
    sortByNewestPlayDate,
    sortByOldestPlayDate,
    findCauseByFunc,
    formatNumber,
} from "../utils.js";
import {
    Authenticatable,
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_POLLING_MAX_INTERVAL,
    DEFAULT_RETRY_MULTIPLIER,
    DeviceId,
    GroupedFixedPlays,
    GroupedPlays,
    InternalConfig,
    NO_DEVICE,
    NO_USER,
    PlayPlatformId,
    PlayUserId,
    ProgressAwarePlayObject,
    SINGLE_USER_PLATFORM_ID,
    SourceType,
} from "../common/infrastructure/Atomic.js";
import {Logger} from '@foxxmd/winston';
import { SourceConfig } from "../common/infrastructure/config/source/sources.js";
import {EventEmitter} from "events";
import {FixedSizeList} from "fixed-size-list";
import TupleMap from "../common/TupleMap.js";
import { PlayObject, TA_CLOSE } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import {ErrorWithCause} from "pony-cause";
import { comparePlayTemporally, temporalAccuracyIsAtLeast } from "../utils/TimeUtils.js";

export interface RecentlyPlayedOptions {
    limit?: number
    formatted?: boolean

    display?: boolean
}

export default abstract class AbstractSource implements Authenticatable {

    name: string;
    type: SourceType;
    identifier: string;

    config: SourceConfig;
    clients: string[];
    logger: Logger;
    instantiatedAt: Dayjs;
    lastActivityAt: Dayjs;

    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;
    authFailure?: boolean;

    buildOK?: boolean | null;
    connectionOK?: boolean | null;

    multiPlatform: boolean = false;

    localUrl: string;

    configDir: string;

    canPoll: boolean = false;
    polling: boolean = false;
    canBacklog: boolean = false;
    userPollingStopSignal: undefined | any;
    pollRetries: number = 0;
    tracksDiscovered: number = 0;

    supportsUpstreamRecentlyPlayed: boolean = false;
    supportsUpstreamNowPlaying: boolean = false;

    emitter: EventEmitter;

    protected recentDiscoveredPlays: GroupedFixedPlays = new TupleMap<DeviceId, PlayUserId, FixedSizeList<ProgressAwarePlayObject>>();

    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {clients = [] } = config;
        this.type = type;
        this.name = name;
        this.identifier = `Source - ${capitalize(this.type)} - ${name}`;
        this.logger = internal.logger.child({labels: [`${capitalize(this.type)} - ${name}`]}, mergeArr);
        this.config = config;
        this.clients = clients;
        this.instantiatedAt = dayjs();
        this.lastActivityAt = this.instantiatedAt;
        this.localUrl = internal.localUrl;
        this.configDir = internal.configDir;
        this.emitter = emitter;
    }

    // default init function, should be overridden if init stage is required
    initialize = async () => {
        this.logger.debug('Attempting to initialize...');
        try {
            await this.buildInitData();
            await this.checkConnection();
            await this.testAuth();
            this.logger.info('Fully Initialized!');
            return true;
        } catch(e) {
            this.logger.error(new ErrorWithCause('Initialization failed', {cause: e}));
            return false;
        }
    }

    public async buildInitData() {
        if(this.buildOK) {
            return;
        }
        try {
            const res = await this.doBuildInitData();
            if(res === undefined) {
                this.buildOK = null;
                this.logger.debug('No required data to build.');
                return;
            }
            if (res === true) {
                this.logger.debug('Building required data init succeeded');
            } else if (typeof res === 'string') {
                this.logger.debug(`Building required data init succeeded => ${res}`);
            }
            this.buildOK = true;
        } catch (e) {
            this.buildOK = false;
            throw new ErrorWithCause('Building required data for initialization failed', {cause: e});
        }
    }

    /**
     * Build any data/config/objects required for this Source to communicate with upstream service
     *
     * * Return undefined if not possible or not required
     * * Return TRUE if build succeeded
     * * Return string if build succeeded and should log result
     * * Throw error on failure
     * */
    protected async doBuildInitData(): Promise<true | string | undefined> {
        return;
    }

    public async checkConnection() {
        try {
            const res = await this.doCheckConnection();
            if (res === undefined) {
                this.logger.debug('Connection check was not required.');
                this.connectionOK = null;
                return;
            } else if (res === true) {
                this.logger.verbose('Connection check succeeded');
            } else {
                this.logger.verbose(`Connection check succeeded => ${res}`);
            }
            this.connectionOK = true;
        } catch (e) {
            this.connectionOK = false;
            throw new ErrorWithCause('Communicating with upstream service failed', {cause: e});
        }
    }

    /**
     * Check Source upstream API/connection to ensure we can communicate
     *
     * * Return undefined if not possible or not required to check
     * * Return TRUE if communication succeeded
     * * Return string if communication succeeded and should log result
     * * Throw error if communication failed
     * */
    protected async doCheckConnection(): Promise<true | string | undefined> {
        return;
    }

    authGated = () => this.requiresAuth && !this.authed

    canTryAuth = () => this.authGated() && this.authFailure !== true

    protected doAuthentication = async (): Promise<boolean> => this.authed

    testAuth = async () => {
        if(!this.requiresAuth) {
            return;
        }

        this.logger.debug('Checking Authentication...');
        try {
            this.authed = await this.doAuthentication();
            this.authFailure = !this.authed;
            this.logger.info(`Auth is ${this.authed ? 'OK' : 'NOT OK'}`)
        } catch (e) {
            // only signal as auth failure if error was NOT a node network error
            this.authFailure = findCauseByFunc(e, isNodeNetworkException) === undefined;
            this.authed = false;
            throw new ErrorWithCause(`Authentication test failed!${this.authFailure === false ? ' Due to a network issue. Will retry authentication on next heartbeat.' : ''}`, {cause: e})
        }
    }

    public isReady() {
        return (this.buildOK === null || this.buildOK === true) &&
            (this.connectionOK === null || this.connectionOK === true)
            && !this.authGated();
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
        for(const list of lists) {
            const existing = list.find(x => playObjDataMatch(x, play) && temporalAccuracyIsAtLeast(TA_CLOSE, comparePlayTemporally(x, play).match));
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

        for(const play of plays) {
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
                data: newDiscoveredPlays,
                options: {
                    ...options,
                    checkTime: newDiscoveredPlays[newDiscoveredPlays.length-1].data.playDate.add(2, 'second'),
                    scrobbleFrom: this.identifier,
                    scrobbleTo: this.clients
                }
            });
        }
    }

    protected processBacklog = async () => {
        if (this.canBacklog) {
            this.logger.info('Discovering backlogged tracks from recently played API...');
            let backlogPlays: PlayObject[] = [];
            try {
                backlogPlays = await this.getBackloggedPlays();
            } catch (e) {
                throw new ErrorWithCause('Error occurred while fetching backlogged plays', {cause: e});
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

    protected getBackloggedPlays = async (): Promise<PlayObject[]> => {
        this.logger.debug('Backlogging not implemented');
        return [];
    }

    protected notify = (payload) => {
        this.emitter.emit('notify', payload);
    }

    onPollPreAuthCheck = async (): Promise<boolean> => true

    onPollPostAuthCheck = async (): Promise<boolean> => true

    poll = async () => {
        if(!(await this.onPollPreAuthCheck())) {
            return;
        }
        if(this.authGated()) {
            if(this.canTryAuth()) {
                await this.testAuth();
                if(!this.authed) {
                    this.notify( {title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because source does not have authentication.', priority: 'error'});
                    this.logger.error('Cannot start polling because source is not authenticated correctly.');
                }
            } else if(this.requiresAuthInteraction) {
                this.notify({title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because user interaction is required for authentication', priority: 'error'});
                this.logger.error('Cannot start polling because user interaction is required for authentication');
            } else {
                this.notify( {title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because source authentication previously failed and must be reauthenticated.', priority: 'error'});
                this.logger.error('Cannot start polling because source authentication previously failed and must be reauthenticated.');
            }
            return;
        }
        if(!(await this.onPollPostAuthCheck())) {
            return;
        }
        try {
            await this.processBacklog();
        } catch (e) {
            this.logger.error(new ErrorWithCause('Cannot start polling because error occurred while processing backlog', {cause: e}));
            this.notify({
                title: `${this.identifier} - Polling Error`,
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
            data: {
                maxPollRetries = 5,
                retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
            } = {},
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
                pollRes = await this.doPolling();
                if(pollRes === true) {
                    break;
                }
            } catch (e) {
                if (this.pollRetries < maxRetries) {
                    const delayFor = pollingBackoff(this.pollRetries + 1, retryMultiplier);
                    this.logger.info(`Poll retries (${this.pollRetries}) less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay...`);
                    this.notify({title: `${this.identifier} - Polling Retry`, message: `Encountered error while polling but retries (${this.pollRetries}) are less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Poll retries (${this.pollRetries}) equal to max poll retries (${maxRetries}), stopping polling!`);
                    this.notify({title: `${this.identifier} - Polling Error`, message: `Encountered error while polling and retries (${this.pollRetries}) are equal to max poll retries (${maxRetries}), stopping polling!. | Error: ${e.message}`, priority: 'error'});
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
        this.notify({title: `${this.identifier} - Polling Started`, message: 'Polling Started', priority: 'info'});
        this.lastActivityAt = dayjs();
        let checkCount = 0;
        let checksOverThreshold = 0;

        const {checkActiveFor = 300, maxInterval = DEFAULT_POLLING_MAX_INTERVAL} = this.config.data;

        try {
            this.polling = true;
            while (!this.shouldStopPolling()) {
                const pollFrom = dayjs();
                this.logger.debug('Refreshing recently played');
                const playObjs = await this.getRecentlyPlayed({formatted: true});

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
                        this.logger.info('Potential plays were discovered close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first');
                        await sleep(10 * 1000);
                    }
                    newDiscovered = this.discover(playObjs);
                    this.scrobble(newDiscovered,
                        {
                            forceRefresh: closeToInterval
                        });
                }


                if(newDiscovered.length > 0) {
                    // only update date if the play date is after the current activity date (in the case of backlogged plays)
                    this.lastActivityAt = newDiscovered[0].data.playDate.isAfter(this.lastActivityAt) ? newDiscovered[0].data.playDate : this.lastActivityAt;
                    checkCount = 0;
                    checksOverThreshold = 0;
                } else {
                    this.logger.debug(`No new tracks discovered`);
                }

                const activeThreshold = this.lastActivityAt.add(checkActiveFor, 's');
                const inactiveFor = dayjs.duration(Math.abs(activeThreshold.diff(dayjs(), 'millisecond'))).humanize(false);
                if (activeThreshold.isBefore(dayjs())) {
                    checksOverThreshold++;
                    if(sleepTime < maxInterval) {
                        const checkVal = Math.min(checksOverThreshold, 1000);
                        const backoff = Math.round(Math.max(Math.min(Math.min(checkVal, 1000) * 2 * (1.1 * checkVal), maxBackoff), 5));
                        sleepTime = interval + backoff;
                        this.logger.debug(`Last activity was at ${this.lastActivityAt.format()} which is ${inactiveFor} outside of active polling period of (last activity + ${checkActiveFor} seconds). Will check again in interval ${interval} + ${backoff} seconds.`);
                    } else {
                        this.logger.debug(`Last activity was at ${this.lastActivityAt.format()} which is ${inactiveFor} outside of active polling period of (last activity + ${checkActiveFor} seconds). Will check again in max interval ${maxInterval} seconds.`);
                    }
                } else {
                    this.logger.debug(`Last activity was at ${this.lastActivityAt.format()}. Will check again in interval ${formatNumber(sleepTime)} seconds.`);
                }

                this.logger.verbose(`Sleeping for ${formatNumber(sleepTime)}s`);
                const wakeUpAt = pollFrom.add(sleepTime, 'seconds');
                while(!this.shouldStopPolling() && dayjs().isBefore(wakeUpAt)) {
                    // check for polling status every half second and wait till wake up time
                    await sleep(500);
                }

            }
            if(this.shouldStopPolling()) {
                this.doStopPolling(this.userPollingStopSignal !== undefined ?  'user input' : undefined);
                return true;
            }
        } catch (e) {
            this.logger.error('Error occurred while polling');
            this.logger.error(e);
            this.emitEvent('statusChange', {status: 'Idle'});
            this.polling = false;
            throw e;
        }
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
}
