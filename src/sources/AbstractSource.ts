import dayjs, {Dayjs} from "dayjs";
import {buildTrackString, capitalize, createLabelledLogger, sleep} from "../utils.js";
import {InternalConfig, PlayObject, SourceType} from "../common/infrastructure/Atomic.js";
import {Logger} from "winston";
import {SourceConfig} from "../common/infrastructure/config/source/sources.js";
import {Notifiers} from "../notifier/Notifiers.js";

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
    notifier: Notifiers;
    instantiatedAt: Dayjs;
    initialized: boolean = false;
    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;

    localUrl: string;

    configDir: string;

    canPoll: boolean = false;
    polling: boolean = false;
    pollRetries: number = 0;
    tracksDiscovered: number = 0;

    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, notifiers: Notifiers) {
        const {clients = [] } = config;
        this.type = type;
        this.name = name;
        this.identifier = `Source - ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(this.identifier, this.identifier);
        this.notifier = notifiers;
        this.config = config;
        this.clients = clients;
        this.instantiatedAt = dayjs();
        this.localUrl = internal.localUrl;
        this.configDir = internal.configDir;
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

    poll = async (allClients: any) => {
        await this.startPolling(allClients);
    }

    startPolling = async (allClients: any) => {
        if(this.requiresAuth && !this.authed) {
            if(this.requiresAuthInteraction) {
                await this.notifier.notify({title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because user interaction is required for authentication', priority: 'error'});
                this.logger.error('Cannot start polling because user interaction is required for authentication');
            } else {
                await this.notifier.notify({title: `${this.identifier} - Polling Error`, message: 'Cannot start polling because source does not have authentication.', priority: 'error'});
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
                await this.doPolling(allClients);
            } catch (e) {
                if (this.pollRetries < maxRetries) {
                    const delayFor = (this.pollRetries + 1) * retryMultiplier;
                    this.logger.info(`Poll retries (${this.pollRetries}) less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay...`);
                    await this.notifier.notify({title: `${this.identifier} - Polling Retry`, message: `Encountered error while polling but retries (${this.pollRetries}) are less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Poll retries (${this.pollRetries}) equal to max poll retries (${maxRetries}), stopping polling!`);
                    await this.notifier.notify({title: `${this.identifier} - Polling Error`, message: `Encountered error while polling and retries (${this.pollRetries}) are equal to max poll retries (${maxRetries}), stopping polling!. | Error: ${e.message}`, priority: 'error'});
                }
                this.pollRetries++;
            }
        }
    }

    /**
     * @param {ScrobbleClients} allClients
     */
    doPolling = async (allClients: any) => {
        if (this.polling === true) {
            return;
        }
        this.logger.info('Polling started');
        this.notifier.notify({title: `${this.identifier} - Polling Started`, message: 'Polling Started', priority: 'info'});
        let lastTrackPlayedAt = this.instantiatedAt;
        let checkCount = 0;
        let checksOverThreshold = 0;

        const {interval = 30, checkActiveFor = 300, maxInterval = 60} = this.config.data;
        const maxBackoff = maxInterval - interval;
        let sleepTime = interval;

        try {
            this.polling = true;
            while (true) {
                // @ts-expect-error TS(2367): This condition will always return 'false' since th... Remove this comment to see the full error message
                if(this.polling === false) {
                    this.logger.info('Stopped polling due to user input');
                    break;
                }
                let playObjs: PlayObject[] = [];
                this.logger.debug('Refreshing recently played');
                playObjs = await this.getRecentlyPlayed({formatted: true});

                const {
                    lastTrackPlayedAt: lastPlayed,
                    scrobbleResult,
                    newTracksFound: newTracks
                } = await this.ingestPlays(playObjs, allClients, lastTrackPlayedAt);

                lastTrackPlayedAt = lastPlayed;

                if(newTracks) {
                    checkCount = 0;
                    checksOverThreshold = 0;
                }

                if (scrobbleResult.length > 0) {
                    checkCount = 0;
                    this.tracksDiscovered += scrobbleResult.length;
                }

                const activeThreshold = lastTrackPlayedAt.add(checkActiveFor, 's');
                const inactiveFor = dayjs.duration(Math.abs(activeThreshold.diff(dayjs(), 'millisecond'))).humanize(false);
                if (activeThreshold.isBefore(dayjs())) {
                    checksOverThreshold++;
                    if(sleepTime < maxInterval) {
                        const checkVal = Math.min(checksOverThreshold, 1000);
                        const backoff = Math.round(Math.max(Math.min(Math.min(checkVal, 1000) * 2 * (1.1 * checkVal), maxBackoff), 5));
                        sleepTime = interval + backoff;
                        this.logger.debug(`Last activity was at ${lastTrackPlayedAt.format()} which is ${inactiveFor} outside of active polling period of (last activity + ${checkActiveFor} seconds). Will sleep for interval ${interval} + ${backoff} seconds.`);
                    } else {
                        this.logger.debug(`Last activity was at ${lastTrackPlayedAt.format()} which is ${inactiveFor} outside of active polling period of (last activity + ${checkActiveFor} seconds). Will sleep for max interval ${maxInterval} seconds.`);
                    }
                } else {
                    sleepTime = interval;
                    this.logger.debug(`Last activity was at ${lastTrackPlayedAt.format()}. Will sleep for interval ${sleepTime} seconds.`);
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

    protected ingestPlays = async (playObjs: PlayObject[], allClients: any, lastTrackPlayedAt: Dayjs) => {
        let newTracksFound = false;
        let closeToInterval = false;
        const now = dayjs();

        const playInfo = playObjs.reduce((acc, playObj) => {
            if(this.recentlyPlayedTrackIsValid(playObj)) {
                const {data: {
                    playDate
                } = {}
                } = playObj;
                if (playDate.unix() > lastTrackPlayedAt.unix()) {
                    newTracksFound = true;
                    this.logger.info(`New Track => ${buildTrackString(playObj)}`);

                    if (closeToInterval === false) {
                        closeToInterval = Math.abs(now.unix() - playDate.unix()) < 5;
                    }

                    return {
                        plays: [...acc.plays, {...playObj, meta: {...playObj.meta, newFromSource: true}}],
                        lastTrackPlayedAt: playDate
                    }
                }
                return {
                    ...acc,
                    plays: [...acc.plays, playObj]
                }
            }
            return acc;
        }, {plays: [], lastTrackPlayedAt});
        playObjs = playInfo.plays;
        lastTrackPlayedAt = playInfo.lastTrackPlayedAt;

        if (playObjs.length > 0 && closeToInterval) {
            // because the interval check was so close to the play date we are going to delay client calls for a few secs
            // this way we don't accidentally scrobble ahead of any other clients (we always want to be behind so we can check for dups)
            // additionally -- it should be ok to have this in the for loop because played_at will only decrease (be further in the past) so we should only hit this once, hopefully
            this.logger.info('Track is close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first');
            await sleep(10 * 1000);
        }

        if (newTracksFound === false) {
            if (playObjs.length === 0) {
                this.logger.debug(`No new tracks found`);
            } else {
                this.logger.debug(`No new tracks found. Newest track returned was ${buildTrackString(playObjs.slice(-1)[0])}`);
            }
        }

        let scrobbleResult = [];

        if(playObjs.length > 0) {
            // use the source instantiation time or the last track play time to determine if we should refresh clients...
            // we only need to refresh clients when the source has "newer" information otherwise we're just refreshing clients for no reason
            scrobbleResult = await allClients.scrobble(playObjs, {
                checkTime: lastTrackPlayedAt.add(2, 's'),
                forceRefresh: closeToInterval,
                scrobbleFrom: this.identifier,
                scrobbleTo: this.clients
            });
        }

        return {
            newTracksFound,
            scrobbleResult,
            lastTrackPlayedAt
        }
    }
}
