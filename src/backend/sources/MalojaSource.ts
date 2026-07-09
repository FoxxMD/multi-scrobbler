import EventEmitter from "events";
import { type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { type InternalConfig } from "../common/infrastructure/Atomic.ts";
import { type RecentlyPlayedOptions } from "./AbstractSource.ts";
import MemorySource from "./MemorySource.ts";
import { MalojaApiClient } from "../common/vendor/maloja/MalojaApiClient.ts";
import { type MalojaSourceConfig } from "../common/infrastructure/config/source/maloja.ts";

export default class MalojaSource extends MemorySource {

    api: MalojaApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: MalojaSourceConfig;

    constructor(name: any, config: MalojaSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super('maloja', name, { ...config, data: { interval, maxInterval, ...restData } }, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.api = new MalojaApiClient(name, config.data, { logger: this.logger });
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        this.supportsUpstreamRecentlyPlayed = true
        this.SCROBBLE_BACKLOG_COUNT = 20;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`)
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        await this.api.testConnection();
        return true;
    }

    doAuthentication = async () => {
        if (this.config.data.apiKey === undefined) {
            throw new Error(`Must provide 'apiKey' in configuration`);
        }
        try {
            return await this.api.testAuth();
        } catch (e) {
            if (isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Maloja API');
            }
            throw e;
        }
    }


    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const { limit = 20 } = options;
        this.setStatus('Checking for new Plays');
        await this.processRecentPlays([]);
        const resp = await this.api.getPaginatedTimeRangeListens({limit, cursor: 0});
        return resp.data;
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            const resp = await this.api.getPaginatedTimeRangeListens({limit: 20, cursor: 0});
            return resp.data;
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({ formatted: true, ...options })

}