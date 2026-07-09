import EventEmitter from "events";
import { type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { type FormatPlayObjectOptions, type InternalConfig } from "../common/infrastructure/Atomic.ts";
import { type PlayPlatformId } from '../../core/Atomic.ts';
import { type RecentlyPlayedOptions } from "./AbstractSource.ts";
import MemorySource from "./MemorySource.ts";
import { RockSkyApiClient } from "../common/vendor/RockSkyApiClient.ts";
import { type RockskySourceConfig } from "../common/infrastructure/config/source/rocksky.ts";

export default class RockskySource extends MemorySource {

    api: RockSkyApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: RockskySourceConfig;

    constructor(name: any, config: RockskySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super('rocksky', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.api = new RockSkyApiClient(name, {...config.data, ...config.options}, {logger: this.logger});
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        this.supportsUpstreamRecentlyPlayed = true
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.SCROBBLE_BACKLOG_COUNT = 20;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`)
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}){ return RockSkyApiClient.formatPlayObj(obj, options); }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                key,
                token,
            } = {}
        } = this.config;
        if (key === undefined && token === undefined) {
            throw new Error('Must provide an API Key or Access Token');
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


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        this.setStatus('Checking for new Plays');
        return await this.api.getRecentlyPlayed(limit);
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            return await this.api.getRecentlyPlayed(20);
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) =>  await this.getRecentlyPlayed({formatted: true, ...options})
}
