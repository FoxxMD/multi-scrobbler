import { Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { hasUpstreamError, UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { DEFAULT_MS_ITEMS_PER_GET_LZ, ListenBrainzClientConfig } from "../common/infrastructure/config/client/listenbrainz.js";
import { ListenbrainzApiClient, playToListenPayload, playToSubmitPayload } from "../common/vendor/ListenbrainzApiClient.js";
import { ListenPayload } from '../common/vendor/listenbrainz/interfaces.js';
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration, shouldUpdatePlayingNowPlatformWhenPlayingOnly } from "./AbstractScrobbleClient.js";
import { isDebugMode } from "../utils.js";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.js";

export default class ListenbrainzScrobbler extends AbstractScrobbleClient {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;
    isKoito: boolean = false;
    getScrobblesForTimeRange: TimeRangeListensFetcher
    declare config: ListenBrainzClientConfig;

    constructor(name: any, config: ListenBrainzClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('listenbrainz', name, config, notifier, emitter, logger);
        this.api = new ListenbrainzApiClient(name, config.data, {logger: this.logger});
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.MAX_INITIAL_SCROBBLES_FETCH = DEFAULT_MS_ITEMS_PER_GET_LZ;
        this.supportsNowPlaying = true;
        // listenbrainz shows Now Playing for the same time as the duration of the track being submitted
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
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
        this.isKoito = this.api.isKoito;
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
        if(this.queuedScrobbles.length === 0) {
            return await this.getScrobblesForTimeRange({limit});
        } else {
            return await this.getScrobblesForTimeRange({limit, from: this.queuedScrobbles[0].play.data.playDate.unix(), to: dayjs().unix()});
        }
    }

    // getScrobblesForTimeRange = async (fromDate?: Dayjs, toDate?: Dayjs, limit: number = 1000): Promise<PlayObject[]> => {
    //     const allPlays: PlayObject[] = [];
    //     let maxTs = toDate?.unix();
    //     const minTs = fromDate?.unix();

    //     while (allPlays.length < limit) {
    //         const batchSize = Math.min(100, limit - allPlays.length);
    //         const resp = await this.api.getUserListensWithPagination({
    //             count: batchSize,
    //             minTs,
    //             maxTs,
    //         });

    //         if (!resp.listens || resp.listens.length === 0) {
    //             break;
    //         }

    //         const plays = resp.listens
    //             .map(l => ListenbrainzApiClient.formatPlayObj(l, {}))
    //             .filter(p => p.data.playDate && p.data.playDate.isValid()); // Filter out plays with invalid dates

    //         allPlays.push(...plays);

    //         if (plays.length < batchSize) {
    //             break;
    //         }

    //         const oldestPlay = plays[plays.length - 1];
    //         if (oldestPlay.data.playDate) {
    //             maxTs = oldestPlay.data.playDate.unix() - 1;
    //         } else {
    //             break;
    //         }
    //     }

    //     return allPlays;
    // }

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
        // listenbrainz shows Now Playing for the same time as the duration of the track being submitted
        try {
            await this.api.submitListen(data.play, { listenType: 'playing_now'});
        } catch (e) {
            throw e;
        }
    }
}
