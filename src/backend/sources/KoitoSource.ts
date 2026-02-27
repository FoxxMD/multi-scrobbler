import EventEmitter from "events";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfig, PaginatedListensTimeRangeOptions, PaginatedTimeRangeListens, TimeRangeListensFetcher } from "../common/infrastructure/Atomic.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import { KoitoApiClient, listenObjectResponseToPlay } from "../common/vendor/koito/KoitoApiClient.js";
import { KoitoSourceConfig } from "../common/infrastructure/config/source/koito.js";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.js";

export default class KoitoSource extends MemorySource {

    api: KoitoApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;
    getScrobblesForTimeRange: TimeRangeListensFetcher

    declare config: KoitoSourceConfig;

    constructor(name: any, config: KoitoSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super('koito', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.api = new KoitoApiClient(name, config.data, {logger: this.logger});
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        this.supportsUpstreamRecentlyPlayed = true
        this.SCROBBLE_BACKLOG_COUNT = 100;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`)
        this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}){ return listenObjectResponseToPlay(obj, options); }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        await this.api.testConnection();
        return true;
    }

    doAuthentication = async () => {
        if(this.config.data.token === undefined) {
            throw new Error('Must provide a User Token in configuration');
        }
        try {
            return await this.api.testAuth();
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Koito API');
            }
            throw e;
        }
    }


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        await this.processRecentPlays([]);
        const resp = await this.getScrobblesForTimeRange({limit, cursor: 0 });
        return resp;
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
        const resp = await this.getScrobblesForTimeRange({limit: 20, cursor: 0 });
        return resp;
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) =>  await this.getRecentlyPlayed({formatted: true, ...options})
}
