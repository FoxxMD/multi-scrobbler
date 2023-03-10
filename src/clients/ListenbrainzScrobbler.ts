import dayjs from 'dayjs';

import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import {
    buildTrackString, capitalize,
    playObjDataMatch, removeUndefinedKeys,
    setIntersection, sleep,
    sortByOldestPlayDate,
    truncateStringToLength,
} from "../utils.js";
import LastfmApiClient from "../apis/LastfmApiClient.js";
import {
    FormatPlayObjectOptions,
    INITIALIZING,
    PlayObject,
    TrackStringOptions
} from "../common/infrastructure/Atomic.js";
import {Notifiers} from "../notifier/Notifiers.js";
import {Logger} from "winston";
import {ListenBrainzClientConfig} from "../common/infrastructure/config/client/listenbrainz.js";
import {ListenbrainzApiClient} from "../apis/ListenbrainzApiClient.js";

export default class ListenbrainzScrobbler extends AbstractScrobbleClient {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: ListenBrainzClientConfig;

    constructor(name: any, config: ListenBrainzClientConfig, options = {}, notifier: Notifiers, logger: Logger) {
        super('listenbrainz', name, config, notifier, logger);
        const {
            data: {
                url
            } = {}
        } = config;
        this.api = new ListenbrainzApiClient(name, config.data);
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => LastfmApiClient.formatPlayObj(obj, options);

    initialize = async () => {
        // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'boolean'.
        this.initialized = INITIALIZING;
        if(this.config.data.token === undefined) {
            this.logger.error('Must provide a User Token');
            this.initialized = false;
        } else {
            try {
                await this.api.testConnection();
                this.initialized = true;
            } catch (e) {
                this.logger.error(e);
                this.initialized = false;
            }
        }
        return this.initialized;
    }

    testAuth = async () => {

        try {
            this.authed = await this.api.testAuth();
        } catch (e) {
            this.logger.error('Could not successfully communicate with Last.fm API');
            this.logger.error(e);
            this.authed = false;
        }
        return this.authed;
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const resp = await this.api.getUserListens(this.config.data.username);
            this.recentScrobbles = resp.sort(sortByOldestPlayDate);
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;

                this.scrobbledPlayObjs = this.scrobbledPlayObjs.filter(x => this.timeFrameIsValid(x.play)[0]);
            }
        }
        this.lastScrobbleCheck = dayjs();
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => {
        return await this.existingScrobble(playObj) !== undefined;
    }

    scrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        let rawPayload = {listen_type: 'single', payload: [ListenbrainzApiClient.playToListen(playObj)]};

        try {
            const resp = await this.api.submitListen(playObj);
            rawPayload = resp;
            this.addScrobbledTrack(playObj, ListenbrainzApiClient.playToListen(playObj));
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }

            // last fm has rate limits but i can't find a specific example of what that limit is. going to default to 1 scrobble/sec to be safe
            await sleep(1000);
        } catch (e) {
            let message = e.message;
            if(e.response !== undefined) {
                if(e.response.body !== undefined) {
                    message = e.response.body.messsage;
                } else if(e.response.text !== undefined) {
                    message = e.response.text;
                }
            }
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${message}`, priority: 'error'});
            this.logger.error(`Failed to scrobble => ${message} | payload => ${JSON.stringify(rawPayload)}`);
            throw e;
        } finally {
            this.logger.debug(`Raw Payload:  ${JSON.stringify(rawPayload)}`);
        }

        return true;
    }
}
