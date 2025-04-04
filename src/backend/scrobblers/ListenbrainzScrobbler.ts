import { Logger } from "@foxxmd/logging";
import dayjs from 'dayjs';
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.ts";
import { buildTrackString, capitalize } from "../../core/StringUtils.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { UpstreamError } from "../common/errors/UpstreamError.ts";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.ts";
import { ListenBrainzClientConfig } from "../common/infrastructure/config/client/listenbrainz.ts";
import { ListenbrainzApiClient, ListenPayload } from "../common/vendor/ListenbrainzApiClient.ts";
import { Notifiers } from "../notifier/Notifiers.ts";

import AbstractScrobbleClient from "./AbstractScrobbleClient.ts";

export default class ListenbrainzScrobbler extends AbstractScrobbleClient {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: ListenBrainzClientConfig;

    constructor(name: any, config: ListenBrainzClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('listenbrainz', name, config, notifier, emitter, logger);
        this.api = new ListenbrainzApiClient(name, config.data, {logger: this.logger});
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => ListenbrainzApiClient.formatPlayObj(obj, options);

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                token,
            } = {}
        } = this.config;
        if (token === undefined) {
            throw new Error('Must provide a User Token');
        }
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        await this.api.testConnection();
        return true;
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

    getScrobblesForRefresh = async (limit: number) => {
        return await this.api.getRecentlyPlayed(limit);
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

        try {
            await this.api.submitListen(playObj, true);

            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return playObj;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            throw new UpstreamError(`Error occurred while making Listenbrainz API scrobble request: ${e.message}`, {cause: e, showStopper: !(e instanceof UpstreamError)});
        }
    }
}
