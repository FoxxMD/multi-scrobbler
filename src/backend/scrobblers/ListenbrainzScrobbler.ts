import dayjs from 'dayjs';

import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { FormatPlayObjectOptions, INITIALIZING } from "../common/infrastructure/Atomic.js";
import { Notifiers } from "../notifier/Notifiers.js";
import {Logger} from "@foxxmd/logging";
import { ListenBrainzClientConfig } from "../common/infrastructure/config/client/listenbrainz.js";
import { ListenbrainzApiClient, ListenPayload } from "../common/vendor/ListenbrainzApiClient.js";
import { PlayObject, TrackStringOptions } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import EventEmitter from "events";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import {ErrorWithCause} from "pony-cause";

export default class ListenbrainzScrobbler extends AbstractScrobbleClient {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: ListenBrainzClientConfig;

    constructor(name: any, config: ListenBrainzClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('listenbrainz', name, config, notifier, emitter, logger);
        this.api = new ListenbrainzApiClient(name, config.data, {logger: this.logger});
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => ListenbrainzApiClient.formatPlayObj(obj, options);

    initialize = async () => {
        // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'boolean'.
        this.initialized = INITIALIZING;
        if(this.config.data.token === undefined) {
            this.logger.error('Could not initialize, must provide a User Token');
            this.initialized = false;
        } else {
            try {
                await this.api.testConnection();
                this.initialized = true;
                this.logger.info('Initialized');
            } catch (e) {
                this.logger.warn(new ErrorWithCause('Could not initialize', {cause: e}));
                this.initialized = false;
            }
        }
        return this.initialized;
    }

    doAuthentication = async () => {

        try {
            return await this.api.testAuth();
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Listenbrainz API');
            }
            throw e;
        }
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const resp = await this.api.getRecentlyPlayed(this.MAX_STORED_SCROBBLES);
            this.logger.debug(`Found ${resp.length} recent scrobbles`);
            this.recentScrobbles = resp;
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;

                this.filterScrobbledTracks();
            }
        }
        this.lastScrobbleCheck = dayjs();
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => (await this.existingScrobble(playObj)) !== undefined

    public playToClientPayload(playObj: PlayObject): ListenPayload {
        return ListenbrainzApiClient.playToListenPayload(playObj);
    }

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        let rawPayload = {listen_type: 'single', payload: [this.playToClientPayload(playObj)]};

        try {
            const resp = await this.api.submitListen(playObj);
            rawPayload = resp;

            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            // last fm has rate limits but i can't find a specific example of what that limit is. going to default to 1 scrobble/sec to be safe
            //await sleep(1000);
            return playObj;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            this.logger.error(`Failed to scrobble => ${e.message}`, {payload: rawPayload});
            if(e instanceof UpstreamError) {
                throw e;
            } else {
                throw new UpstreamError(`Error occurred while making Listenbrainz API request: ${e.message}`, {cause: e, showStopper: true});
            }
        } finally {
            this.logger.debug(`Raw Payload:`, {rawPayload});
        }
    }
}
