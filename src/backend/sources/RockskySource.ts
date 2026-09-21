import type EventEmitter from "events";
import { COMPONENT_AUTH_TYPE, type ComponentAuthType, PARSED_FROM, type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import type {FormatPlayObjectOptions, InternalConfig} from "../common/infrastructure/Atomic.ts";
import type {RecentlyPlayedOptions} from "./AbstractSource.ts";
import MemorySource from "./MemorySource.ts";
import { RockSkyApiClient } from "../common/vendor/RockSkyApiClient.ts";
import type {RockskySourceConfig} from "../common/infrastructure/config/source/rocksky.ts";

export default class RockskySource extends MemorySource {

    api: RockSkyApiClient;
    override authType: ComponentAuthType = COMPONENT_AUTH_TYPE.unattended;
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
        if ('token' in this.config.data) {
            this.logger.warn('Token authentication is no longer required and can be safely removed.');
        }
        try {
            await this.api.buildData();
        } catch (e) {
            this.logger.warn(new Error('Failed to deterine if atproto identifier is real. Will proceed with config-defined handle but it may fail!', {cause: e}));
        }
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        await this.api.testConnection();
        return true;
    }

    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        this.setStatus('Checking for new Plays');
        return (await this.api.getRecentlyPlayed(limit)).map((x) => ({...x, meta: {...x.meta, parsedFrom: PARSED_FROM.history}}));
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
