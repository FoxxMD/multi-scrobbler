import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { playToListenPayload } from "../common/vendor/ListenbrainzApiClient.js";
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { shouldUpdatePlayingNowPlatformWhenPlayingOnly } from "./AbstractScrobbleClient.js";
import { isDebugMode } from "../utils.js";
import { KoitoClientConfig } from "../common/infrastructure/config/client/koito.js";
import { KoitoApiClient, listenObjectResponseToPlay } from "../common/vendor/koito/KoitoApiClient.js";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.js";
import dayjs from "dayjs";

export default class KoitoScrobbler extends AbstractScrobbleClient {

    api: KoitoApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;
    getScrobblesForTimeRange: TimeRangeListensFetcher
    declare config: KoitoClientConfig;

    constructor(name: any, config: KoitoClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('koito', name, config, notifier, emitter, logger);
        this.api = new KoitoApiClient(name, config.data, {logger: this.logger});
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
        this.supportsNowPlaying = true;
        this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => listenObjectResponseToPlay(obj, options);

    public playToClientPayload(playObject: PlayObject): object {
        return playToListenPayload(playObject);
    }


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
                this.logger.error('Could not communicate with Koito API');
            }
            throw e;
        }
    }

    getScrobblesForRefresh = async (limit: number) => {
        if(this.queuedScrobbles.length === 0) {
            return await this.getScrobblesForTimeRange({limit, page: 0});
        } else {
            return await this.getScrobblesForTimeRange({limit, page: 0, from: this.queuedScrobbles[0].play.data.playDate.unix(), to: dayjs().unix()});
        }
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => (await this.existingScrobble(playObj)) !== undefined

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        try {
            const result = await this.api.submitListen(playObj, { log: isDebugMode()});

            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return result;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            throw e;
        }
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        try {
            await this.api.submitListen(data.play, { listenType: 'playing_now'});
        } catch (e) {
            throw e;
        }
    }
}
