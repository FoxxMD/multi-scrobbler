import EventEmitter from "events";
import { type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { type FormatPlayObjectOptions, type InternalConfig } from "../common/infrastructure/Atomic.ts";
import { type RecentlyPlayedOptions } from "./AbstractSource.ts";
import MemorySource from "./MemorySource.ts";
import { TealApiClient } from "../common/vendor/teal/TealApiClient.ts";
import { recordToPlay } from "../common/vendor/teal/TealApiClient.ts";
import { type TealSourceConfig } from "../common/infrastructure/config/source/tealfm.ts";
import { ATProtoAppApiClient } from "../common/vendor/atproto/ATProtoAppApiClient.ts";
import { parseArrayFromMaybeString } from "../utils/StringUtils.ts";

export default class TealfmSource extends MemorySource {

    client: TealApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    serviceAllow: string[]
    serviceDeny: string[]

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
        this.client = new TealApiClient(name, config.data, {...internal, logger: internal.logger});
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        this.supportsUpstreamRecentlyPlayed = true
        this.SCROBBLE_BACKLOG_COUNT = 20;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}){ return recordToPlay(obj); }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                identifier,
                serviceAllow = [],
                serviceDeny = []
            } = {}
        } = this.config;
        if (identifier === undefined) {
            throw new Error('Must provide an identifier');
        }

        await this.client.client.initClient();

        this.serviceAllow = parseArrayFromMaybeString(serviceAllow, {lower: true});
        if(this.serviceAllow.length > 0) {
            this.logger.debug(`Discover Plays from these services only: ${this.serviceAllow.join(',')}`);
        } else {
            this.serviceDeny = parseArrayFromMaybeString(serviceDeny, {lower: true});
            if(this.serviceDeny.length > 0) {
                this.logger.debug(`Do not discover Plays from these services: ${this.serviceDeny.join(',')}`);
            }
        }

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if (this.client instanceof ATProtoAppApiClient) {
            try {
                return await this.client.checkPds(this.config.data);
            } catch (e) {
                throw e;
            }
        } else {
            return true;
        }
    }

    doAuthentication = async () => {
        try {
            const sessionRes = await this.client.client.restoreSession();
            if(sessionRes) {
                return true;
            }
            if(this.client.client instanceof ATProtoAppApiClient) {
                return await this.client.client.appLogin();
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
        let plays: PlayObject[];
        this.setStatus('Checking for new Plays');
        try {
            const {data} = await this.client.getPagelessTimeRangeListens({limit})
            plays = data;
        } catch (e) {
            throw new Error('Error occurred while trying to fetch records', {cause: e});
        }
        await this.processRecentPlays([]);
        if(this.serviceAllow.length > 0) {
            plays = plays.filter(x => 
                (x.meta.musicService !== undefined && this.serviceAllow.some(y => x.meta.musicService.toLocaleLowerCase().includes(y)))
            || (x.meta.musicService === undefined && this.serviceAllow.includes('unknown'))
        );
        } else if(this.serviceDeny.length > 0) {
            plays = plays.filter(x => 
                (x.meta.musicService !== undefined && !this.serviceDeny.some(y => x.meta.musicService.toLocaleLowerCase().includes(y)))
                || (x.meta.musicService === undefined && !this.serviceAllow.includes('unknown'))
            );
        }
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
