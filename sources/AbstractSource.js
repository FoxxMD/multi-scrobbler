import dayjs from "dayjs";
import {buildTrackString, capitalize, createLabelledLogger, sleep} from "../utils.js";

export default class AbstractSource {

    name;
    type;
    identifier;

    config;
    clients;
    logger;
    instantiatedAt;
    initialized = false;
    requiresAuth = false;
    requiresAuthInteraction = false;
    authed = false;

    canPoll = false;
    polling = false;
    pollRetries = 0;
    tracksDiscovered = 0;

    constructor(type, name, config = {}, clients = []) {
        this.type = type;
        this.name = name;
        this.identifier = `Source - ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(this.identifier, this.identifier);
        this.config = config;
        this.clients = clients;
        this.instantiatedAt = dayjs();
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

    getRecentlyPlayed = async (options = {}) => {
        return [];
    }

    // by default if the track was recently played it is valid
    // this is useful for sources where the track doesn't have complete information like Subsonic
    // TODO make this more descriptive? or move it elsewhere
    recentlyPlayedTrackIsValid = (playObj) => {
        return true;
    }

    poll = async (allClients) => {
        await this.startPolling(allClients);
    }

    startPolling = async (allClients) => {
        if(this.requiresAuthInteraction && !this.authed) {
            this.logger.error('Cannot start polling because user interaction is required for authentication');
            return;
        }
        // reset poll attempts if already previously run
        this.pollRetries = 0;

        const {
            maxPollRetries = 0,
            retryMultiplier = 1.5,
        } = this.config;

        // can't have negative retries!
        const maxRetries = Math.max(0, maxPollRetries);

        while (this.pollRetries <= maxRetries) {
            try {
                await this.doPolling(allClients);
            } catch (e) {
                if (this.pollRetries < maxRetries) {
                    const delayFor = (this.pollRetries + 1) * retryMultiplier;
                    this.logger.info(`Poll reties (${this.pollRetries}) less than max poll retries (${maxRetries}), restarting polling after ${delayFor} second delay...`);
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Poll retries (${this.pollRetries}) equal to max poll retries (${maxRetries}), stopping polling!`);
                }
                this.pollRetries++;
            }
        }
    }

    /**
     * @param {ScrobbleClients} allClients
     */
    doPolling = async (allClients) => {
        if (this.polling === true) {
            return;
        }
        this.logger.info('Polling started');
        let lastTrackPlayedAt = this.instantiatedAt;
        let checkCount = 0;
        let checksOverThreshold = 0;
        try {
            this.polling = true;
            while (true) {
                if(this.polling === false) {
                    this.logger.info('Stopped polling due to user input');
                    break;
                }
                let playObjs = [];
                this.logger.debug('Refreshing recently played')
                playObjs = await this.getRecentlyPlayed({formatted: true});
                checkCount++;
                let newTracksFound = false;
                let closeToInterval = false;
                const now = dayjs();

                const playInfo = playObjs.reduce((acc, playObj) => {
                    if(this.recentlyPlayedTrackIsValid(playObj)) {
                        const {data: {playDate} = {}} = playObj;
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

                if (closeToInterval) {
                    // because the interval check was so close to the play date we are going to delay client calls for a few secs
                    // this way we don't accidentally scrobble ahead of any other clients (we always want to be behind so we can check for dups)
                    // additionally -- it should be ok to have this in the for loop because played_at will only decrease (be further in the past) so we should only hit this once, hopefully
                    this.logger.info('Track is close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first');
                    await sleep(10 * 1000);
                }

                if (newTracksFound === false) {
                    if (playObjs.length === 0) {
                        this.logger.debug(`No new tracks found and no tracks returned from API`);
                    } else {
                        this.logger.debug(`No new tracks found. Newest track returned was ${buildTrackString(playObjs.slice(-1)[0])}`);
                    }
                } else {
                    checkCount = 0;
                    checksOverThreshold = 0;
                }

                // use the source instantiation time or the last track play time to determine if we should refresh clients..
                // we only need to refresh clients when the source has "newer" information otherwise we're just refreshing clients for no reason
                const scrobbleResult = await allClients.scrobble(playObjs, {
                    checkTime: lastTrackPlayedAt.add(2, 's'),
                    forceRefresh: closeToInterval,
                    scrobbleFrom: this.identifier,
                    scrobbleTo: this.clients
                });

                if (scrobbleResult.length > 0) {
                    checkCount = 0;
                    this.tracksDiscovered += scrobbleResult.length;
                }

                const {interval = 30, checkActiveFor = 300, maxSleep = 300} = this.config;

                let sleepTime = interval;
                // don't need to do back off calc if interval is 5 minutes or greater since its already pretty light on API calls
                // and don't want to back off if we just started the app
                const activeThreshold = lastTrackPlayedAt.add(checkActiveFor, 's');
                if (activeThreshold.isBefore(dayjs()) && sleepTime < 300) {
                    checksOverThreshold++;
                    const backoffMultiplier = Math.min(checksOverThreshold, 1000) * 1.5;
                    sleepTime = Math.min(interval * backoffMultiplier, maxSleep);
                }

                // sleep for interval
                this.logger.debug(`Sleeping for ${sleepTime}s`);
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
