import dayjs, {Dayjs} from "dayjs";
import {
    buildTrackString,
    capitalize, closePlayDate,
    createLabelledLogger,
    genGroupId,
    playObjDataMatch,
    sleep, sortByNewestPlayDate,
    sortByOldestPlayDate
} from "../utils.js";
import {
    GroupedFixedPlays,
    GroupedPlays,
    InternalConfig,
    PlayObject, ProgressAwarePlayObject,
    SourceType
} from "../common/infrastructure/Atomic.js";
import {Logger} from "winston";
import {SourceConfig} from "../common/infrastructure/config/source/sources.js";
import {EventEmitter} from "events";
import {FixedSizeList} from "fixed-size-list";

export interface RecentlyPlayedOptions {
    limit?: number
    formatted?: boolean

    display?: boolean
}

export default abstract class AbstractSource {

    name: string;
    type: SourceType;
    identifier: string;

    config: SourceConfig;
    clients: string[];
    logger: Logger;
    instantiatedAt: Dayjs;
    lastActivityAt: Dayjs;
    initialized: boolean = false;
    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;

    multiPlatform: boolean = false;

    localUrl: string;

    configDir: string;

    canPoll: boolean = false;
    polling: boolean = false;
    pollRetries: number = 0;
    tracksDiscovered: number = 0;

    emitter: EventEmitter;

    protected recentDiscoveredPlays: GroupedFixedPlays = new Map();

    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {clients = [] } = config;
        this.type = type;
        this.name = name;
        this.identifier = `Source - ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(this.identifier, this.identifier);
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
        this.initialized = true;
        return this.initialized;
    }

    // default init function, should be overridden if auth stage is required
    testAuth = async () => {
        return this.authed;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        return [];
    }

    // by default if the track was recently played it is valid
    // this is useful for sources where the track doesn't have complete information like Subsonic
    // TODO make this more descriptive? or move it elsewhere
    recentlyPlayedTrackIsValid = (playObj: PlayObject) => {
        return true;
    }

    protected addPlayToDiscovered = (play: PlayObject) => {
        const platformId = this.multiPlatform ? genGroupId(play) : 'SingleUser';
        const list = this.recentDiscoveredPlays.get(platformId) ?? new FixedSizeList<ProgressAwarePlayObject>(30);
        list.add(play);
        this.recentDiscoveredPlays.set(platformId, list);
        this.tracksDiscovered++;
        this.logger.info(`Discovered => ${buildTrackString(play)}`);
    }

    getFlatRecentlyDiscoveredPlays = (): PlayObject[] => {
        return Array.from(this.recentDiscoveredPlays.values()).map(x => x.data).flat(3).sort(sortByNewestPlayDate);
    }

    getRecentlyDiscoveredPlaysByPlatform = (platformId): PlayObject[] => {
        const list = this.recentDiscoveredPlays.get(platformId);
        if (list !== undefined) {
            const data = [...list.data];
            data.sort(sortByOldestPlayDate);
            return data;
        }
        return [];
    }

    existingDiscovered = (play: PlayObject): PlayObject | undefined => {
        const list = this.getRecentlyDiscoveredPlaysByPlatform(this.multiPlatform ? genGroupId(play) : 'SingleUser');
        return list.find(x => playObjDataMatch(x, play) && closePlayDate(x, play));
    }

    alreadyDiscovered = (play: PlayObject): boolean => {
        return this.existingDiscovered(play) !== undefined;
    }


    protected scrobble = (plays: PlayObject[], options: { forceRefresh?: boolean } = {}) => {

        const newDiscoveredPlays: PlayObject[] = [];

        for(const play of plays) {
            if(!this.alreadyDiscovered(play)) {
                this.addPlayToDiscovered(play);
            }
            newDiscoveredPlays.push(play);
        }

        if(newDiscoveredPlays.length > 0) {
            newDiscoveredPlays.sort(sortByOldestPlayDate);

            this.emitter.emit('scrobble', {
                data: newDiscoveredPlays,
                options: {
                    ...options,
                    checkTime: newDiscoveredPlays[newDiscoveredPlays.length-1].data.playDate.add(2, 'second'),
                    scrobbleFrom: this.identifier,
                    scrobbleTo: this.clients
                }
            });
        }

        return newDiscoveredPlays;
    }

    protected notify = (payload) => {
        this.emitter.emit('notify', payload);
    }

    poll = async () => {
        await this.startPolling();
    }

    startPolling = async () => {
        if(this.requiresAuth && !this.authed) {
            if(this.requiresAuthInteraction) {
                this.notify({title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because user interaction is required for authentication', priority: 'error'});
                this.logger.error('Cannot start polling because user interaction is required for authentication');
            } else {
                this.notify( {title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because source does not have authentication.', priority: 'error'});
                this.logger.error('Cannot start polling because source is not authenticated correctly.');
            }
            return;
        }
        // reset poll attempts if already previously run
        this.pollRetries = 0;

        const {
            data: {
                maxPollRetries = 0,
                retryMultiplier = 1.5,
            } = {},
        } = this.config;

        // can't have negative retries!
        const maxRetries = Math.max(0, maxPollRetries);

        while (this.pollRetries <= maxRetries) {
            try {
                await this.doPolling();
            } catch (e) {
                if (this.pollRetries < maxRetries) {
                    const delayFor = (this.pollRetries + 1) * retryMultiplier;
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

    doPolling = async () => {
        if (this.polling === true) {
            return;
        }
        this.logger.info('Polling started');
        this.notify({title: `${this.identifier} - Polling Started`, message: 'Polling Started', priority: 'info'});
        this.lastActivityAt = dayjs();
        let checkCount = 0;
        let checksOverThreshold = 0;

        const {interval = 30, checkActiveFor = 300, maxInterval = 60} = this.config.data;
        const maxBackoff = maxInterval - interval;
        let sleepTime = interval;

        try {
            this.polling = true;
            while (true) {
                // @ts-ignore
                if(this.polling === false) {
                    this.logger.info('Stopped polling due to user input');
                    break;
                }
                this.logger.debug('Refreshing recently played');
                const playObjs = await this.getRecentlyPlayed({formatted: true});

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
                    newDiscovered = this.scrobble(playObjs,
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
                        this.logger.debug(`Last activity was at ${this.lastActivityAt.format()} which is ${inactiveFor} outside of active polling period of (last activity + ${checkActiveFor} seconds). Will sleep for interval ${interval} + ${backoff} seconds.`);
                    } else {
                        this.logger.debug(`Last activity was at ${this.lastActivityAt.format()} which is ${inactiveFor} outside of active polling period of (last activity + ${checkActiveFor} seconds). Will sleep for max interval ${maxInterval} seconds.`);
                    }
                } else {
                    sleepTime = interval;
                    this.logger.debug(`Last activity was at ${this.lastActivityAt.format()}. Will sleep for interval ${sleepTime} seconds.`);
                }

                this.logger.verbose(`Sleeping for ${sleepTime}s`);
                await sleep(sleepTime * 1000);

            }
        } catch (e) {
            this.logger.error('Error occurred while polling');
            this.logger.error(e);
            this.polling = false;
            throw e;
        }
    }
}
