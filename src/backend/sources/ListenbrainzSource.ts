import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";
import { FormatPlayObjectOptions, INITIALIZING, InternalConfig } from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz.js";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient.js";
import MemorySource from "./MemorySource.js";
import request from "superagent";
import {isNodeNetworkException} from "../common/errors/NodeErrors.js";
import {PlayObject, SOURCE_SOT} from "../../core/Atomic.js";

export default class ListenbrainzSource extends MemorySource {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

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
        this.supportsUpstreamRecentlyPlayed = true;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`)
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}){ return ListenbrainzApiClient.formatPlayObj(obj, options); }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await request.get(this.api.url);
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
        this.processRecentPlays(now.listens.map(x => ListenbrainzSource.formatPlayObj(x)));
        return await this.api.getRecentlyPlayed(limit);
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            return await this.api.getRecentlyPlayed(20);
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async () => await this.getRecentlyPlayed({formatted: true})
}
