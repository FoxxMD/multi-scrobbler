import EventEmitter from "events";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import { AbstractBlueSkyApiClient, listRecordToPlay, recordToPlay } from "../common/vendor/bluesky/AbstractBlueSkyApiClient.js";
import { TealSourceConfig } from "../common/infrastructure/config/source/tealfm.js";
import { BlueSkyAppApiClient } from "../common/vendor/bluesky/BlueSkyAppApiClient.js";
import { BlueSkyOauthApiClient } from "../common/vendor/bluesky/BlueSkyOauthApiClient.js";
import { ListRecord, ScrobbleRecord } from "../common/infrastructure/config/client/tealfm.js";

export default class TealfmSource extends MemorySource {

    client: AbstractBlueSkyApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: TealSourceConfig;

    constructor(name: any, config: TealSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super('tealfm', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        if(config.data.appPassword !== undefined) {
            this.client = new BlueSkyAppApiClient(name, {...config.data, pds: config.options?.pds}, {...internal, logger: internal.logger});
            this.requiresAuthInteraction = false;
        } else if(config.data.baseUri !== undefined) {
            this.client = new BlueSkyOauthApiClient(name, {...config.data, pds: config.options?.pds}, {...internal, logger: internal.logger});
        } else {
            throw new Error(`Must define either 'baseUri' or 'appPassword' in configuration!`);
        }
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        this.supportsUpstreamRecentlyPlayed = true
        this.SCROBBLE_BACKLOG_COUNT = 20;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}){ return recordToPlay(obj); }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                identifier,
            } = {}
        } = this.config;
        if (identifier === undefined) {
            throw new Error('Must provide an identifier');
        }
        this.client.initClient();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        return true;
    }

    doAuthentication = async () => {
        try {
            const sessionRes = await this.client.restoreSession();
            if(sessionRes) {
                return true;
            }
            if(this.client instanceof BlueSkyAppApiClient) {
                return await this.client.appLogin();
            }
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with ATProto API');
            }
            throw e;
        }
    }


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        let list: ListRecord<ScrobbleRecord>[];
        try {
            list = await this.client.listScrobbleRecord(limit)
        } catch (e) {
            throw new Error('Error occurred while trying to fetch records', {cause: e});
        }
        this.processRecentPlays([]);
        const plays = list.map(x => listRecordToPlay(x));
        return plays;
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            return await this.getRecentlyPlayed(options);
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) =>  await this.getRecentlyPlayed({formatted: true, ...options})
}
