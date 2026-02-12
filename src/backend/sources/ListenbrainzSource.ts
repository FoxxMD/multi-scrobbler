import EventEmitter from "events";
import request from "superagent";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfig, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PlayPlatformId, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz.js";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import { isPortReachableConnect } from "../utils/NetworkUtils.js";
import { Logger } from "@foxxmd/logging";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { NowPlayingPlayerState } from "./PlayerState/NowPlayingPlayerState.js";
import { ManipulateType } from "dayjs";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.js";

export default class ListenbrainzSource extends MemorySource {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;
    getScrobblesForTimeRange: TimeRangeListensFetcher
    declare config: ListenBrainzSourceConfig;

    constructor(name: any, config: ListenBrainzSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super('listenbrainz', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.api = new ListenbrainzApiClient(name, config.data, {logger: this.logger});
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        this.supportsUpstreamRecentlyPlayed = true
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.SCROBBLE_BACKLOG_COUNT = 100;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`)
        this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}){ return ListenbrainzApiClient.formatPlayObj(obj, options); }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await isPortReachableConnect(this.api.url.port, {host: this.api.url.url.hostname});
            const isKoito = await this.api.checkKoito();
            if(isKoito) {
                throw new Error('The given URL looks like a Koito instance. Use the Koito Source instead of Listenbrainz.')
            }
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                throw new Error('Could not communicate with Listenbrainz API server', {cause: e});
            } else if(e.status !== 410) {
                throw new Error('Listenbrainz API server returning an unexpected response', {cause: e})
            }
            return true;
        }
    }

    doAuthentication = async () => {
        if(this.config.data.token === undefined) {
            throw new Error('Must provide a User Token in configuration');
        }
        try {
            return await this.api.testAuth();
        } catch (e) {
            throw e;
            //throw new Error('Could not communicate with Listenbrainz API', {cause: e});
        }
    }


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        const now = await this.api.getPlayingNow();
        await this.processRecentPlays(now.listens.map(x => ListenbrainzSource.formatPlayObj(x)));
        return await this.getScrobblesForTimeRange({limit});
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            return await this.getScrobblesForTimeRange({limit: 20});
        } catch (e) {
            throw e;
        }
    }

    getPaginatedUnitOfTime(): ManipulateType {
        return 'second';
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) =>  await this.getRecentlyPlayed({formatted: true, ...options})

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new NowPlayingPlayerState(logger,  id, opts);
}
