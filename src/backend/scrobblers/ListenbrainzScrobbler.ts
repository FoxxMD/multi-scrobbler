import dayjs from 'dayjs';

import AbstractScrobbleClient from "./AbstractScrobbleClient";
import { FormatPlayObjectOptions, INITIALIZING } from "../common/infrastructure/Atomic";
import { Notifiers } from "../notifier/Notifiers";
import {Logger} from '@foxxmd/winston';
import { ListenBrainzClientConfig } from "../common/infrastructure/config/client/listenbrainz";
import {ListenbrainzApiClient, ListenPayload} from "../common/vendor/ListenbrainzApiClient";
import { PlayObject, TrackStringOptions } from "../../core/Atomic";
import {buildTrackString, capitalize} from "../../core/StringUtils";
import EventEmitter from "events";
import {UpstreamError} from "../common/errors/UpstreamError";
import {isNodeNetworkException} from "../common/errors/NodeErrors";
import {ErrorWithCause} from "pony-cause";

export default class ListenbrainzScrobbler extends AbstractScrobbleClient {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: ListenBrainzClientConfig;

    constructor(name: any, config: ListenBrainzClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('listenbrainz', name, config, notifier, emitter, logger);
        this.api = new ListenbrainzApiClient(name, config.data);
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

    alreadyScrobbled = async (playObj: PlayObject, log = false) => {
        return (await this.existingScrobble(playObj)) !== undefined;
    }

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
            let message = e.message;
            if(e.response !== undefined) {
                if(e.response.body !== undefined) {
                    message = e.response.body.messsage;
                } else if(e.response.text !== undefined) {
                    message = e.response.text;
                }
            }
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${message}`, priority: 'error'});
            this.logger.error(`Failed to scrobble => ${message}`, {payload: rawPayload});
            throw new UpstreamError(`Error received from Listenbrainz API: ${message}`, {cause: e, showStopper: true});
        } finally {
            this.logger.debug(`Raw Payload:`, {rawPayload});
        }
    }
}
