import EventEmitter from "events";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfig, PaginatedListensTimeRangeOptions, PaginatedTimeRangeListens } from "../common/infrastructure/Atomic.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import { KoitoApiClient, listenObjectResponseToPlay } from "../common/vendor/koito/KoitoApiClient.js";
import { KoitoSourceConfig } from "../common/infrastructure/config/source/koito.js";

export default class KoitoSource extends MemorySource implements PaginatedTimeRangeListens {

    api: KoitoApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

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
        return await this.api.getRecentlyPlayed(limit);
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            return await this.api.getRecentlyPlayed(20);
        } catch (e) {
            throw e;
        }
    }

    getPaginatedTimeRangeListens = async (params: PaginatedListensTimeRangeOptions) => {
        return await this.api.getPaginatedTimeRangeListens(params);
    }

    getPaginatedUnitOfTime() {
        return this.api.getPaginatedUnitOfTime();
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) =>  await this.getRecentlyPlayed({formatted: true, ...options})
}
