import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";
import { FormatPlayObjectOptions, INITIALIZING, InternalConfig } from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz.js";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient.js";
import MemorySource from "./MemorySource.js";
import {ErrorWithCause} from "pony-cause";

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
        this.api = new ListenbrainzApiClient(name, config.data);
        this.playerSourceOfTruth = false;
    }

    static formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => ListenbrainzApiClient.formatPlayObj(obj, options);

    initialize = async () => {
        // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'boolean'.
        this.initialized = INITIALIZING;
        if(this.config.data.token === undefined) {
            this.logger.error('Must provide a User Token');
            this.initialized = false;
        } else {
            try {
                await this.api.testConnection();
                this.initialized = true;
            } catch (e) {
                this.logger.error(e);
                this.initialized = false;
            }
        }
        return this.initialized;
    }

    doAuthentication = async () => {
        try {
            return await this.api.testAuth();
        } catch (e) {
            throw e;
            //throw new ErrorWithCause('Could not communicate with Listenbrainz API', {cause: e});
        }
    }


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        const now = await this.api.getPlayingNow();
        this.processRecentPlays(now.listens.map(x => ListenbrainzSource.formatPlayObj(x)));
        return await this.api.getRecentlyPlayed(limit);
    }

    protected getBackloggedPlays = async () => {
        return await this.getRecentlyPlayed({formatted: true});
    }
}
