import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { ListenBrainzClientConfig } from "../common/infrastructure/config/client/listenbrainz.js";
import { ListenbrainzApiClient, playToListenPayload } from "../common/vendor/ListenbrainzApiClient.js";
import { ListenPayload } from '../common/vendor/listenbrainz/interfaces.js';
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { isDebugMode } from "../utils.js";
import { RockSkyApiClient } from "../common/vendor/RockSkyApiClient.js";
import { RockSkyClientConfig } from "../common/infrastructure/config/client/rocksky.js";

export default class RockskyScrobbler extends AbstractScrobbleClient {

    api: RockSkyApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: RockSkyClientConfig;

    constructor(name: any, config: RockSkyClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('rocksky', name, config, notifier, emitter, logger);
        this.api = new RockSkyApiClient(name, {...config.data, ...config.options}, {logger: this.logger});
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
        this.supportsNowPlaying = false;
        // PDS rate limit for operations is ~2/sec
        this.scrobbleDelay = 2000;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => ListenbrainzApiClient.formatPlayObj(obj, options);

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                key,
            } = {}
        } = this.config;
        if (key === undefined) {
            throw new Error('Must provide an API Key');
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
                this.logger.error('Could not communicate with Rocksky API');
            }
            throw e;
        }
    }

    getScrobblesForRefresh = async (limit: number) => {
        return await this.api.getRecentlyPlayed(limit);
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => (await this.existingScrobble(playObj)) !== undefined

    public playToClientPayload(playObj: PlayObject): ListenPayload {
        return playToListenPayload(playObj);
    }

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        try {
            const resp = await this.api.submitListen(playObj, { log: isDebugMode()});

            if((resp.payload?.ignored_listens ?? 0) > 0) {
                throw new UpstreamError('Scrobble was successfully submitted but Rocksky ignored it', {showStopper: false});
            }

            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return playObj;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            throw new UpstreamError(`Error occurred while making Rocksky API scrobble request: ${e.message}`, {cause: e, showStopper: !(e instanceof UpstreamError)});
        }
    }

    doPlayingNow = async (data: PlayObject) => {
        try {
            await this.api.submitListen(data, { listenType: 'playing_now'});
        } catch (e) {
            throw new UpstreamError(`Error occurred while making Rocksky API Playing Now request: ${e.message}`, {cause: e, showStopper: !(e instanceof UpstreamError)});
        }
    }
}
