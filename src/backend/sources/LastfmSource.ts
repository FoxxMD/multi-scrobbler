import dayjs, { ManipulateType } from "dayjs";
import EventEmitter from "events";
import request from "superagent";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfig, PaginatedListensTimeRangeOptions, PaginatedTimeRangeListens, PlayPlatformId, SourceType, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { LastfmSourceConfig } from "../common/infrastructure/config/source/lastfm.js";
import LastfmApiClient, { formatPlayObj } from "../common/vendor/LastfmApiClient.js";
import { sortByOldestPlayDate } from "../utils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import { Logger } from "@foxxmd/logging";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { NowPlayingPlayerState } from "./PlayerState/NowPlayingPlayerState.js";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.js";

export default class LastfmSource extends MemorySource {

    api: LastfmApiClient;
    requiresAuth = true;
    requiresAuthInteraction = true;
    upstreamType: string = 'Last.fm';
    getScrobblesForTimeRange: TimeRangeListensFetcher

    declare config: LastfmSourceConfig;

    constructor(name: any, config: LastfmSourceConfig, internal: InternalConfig, emitter: EventEmitter, type: SourceType = 'lastfm') {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super(type, name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.supportsUpstreamRecentlyPlayed = true;
        this.supportsUpstreamNowPlaying = true;
        this.api = new LastfmApiClient(name, config.data, {logger: this.logger, type, ...internal});
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        // https://www.last.fm/api/show/user.getRecentTracks
        this.SCROBBLE_BACKLOG_COUNT = 200;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`);
        this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        return formatPlayObj(obj, options);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        return await this.api.initialize();
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await this.api.testConnection();
            return true;
        } catch (e) {
            throw e;
        }
    }

    doAuthentication = async () => {
        try {
            return await this.api.testAuth();
        } catch (e) {
            throw e;
        }
    }


    getLastfmRecentTrack = async(options: RecentlyPlayedOptions = {}): Promise<[PlayObject[], PlayObject[]]> => {
        const {limit = 20} = options;
        try {
            const {data: plays} = await this.api.getPaginatedTimeRangeListens({limit, cursor: 1});
            plays.sort(sortByOldestPlayDate);
            // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
            // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
            // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
            const history = plays.filter(x => x.meta.nowPlaying !== true);
            const now = plays.filter(x => x.meta.nowPlaying === true);
            return [history, now];
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            const [history, now] = await this.getLastfmRecentTrack(options);
            await this.processRecentPlays(now);
            return  history;
        } catch (e) {
            throw e;
        }
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            const [history, now] = await this.getLastfmRecentTrack(options);
            return history;
        } catch (e) {
            throw e;
        }
    }

    getUpstreamNowPlaying = async (): Promise<PlayObject[]> => {
        try {
            const [history, now] = await this.getLastfmRecentTrack();
            return now;
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({formatted: true, ...options})

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new NowPlayingPlayerState(logger,  id, opts);
}
