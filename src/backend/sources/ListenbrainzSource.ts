import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource";
import { FormatPlayObjectOptions, INITIALIZING, InternalConfig } from "../common/infrastructure/Atomic";
import EventEmitter from "events";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient";

export default class ListenbrainzSource extends AbstractSource {

    api: ListenbrainzApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: ListenBrainzSourceConfig;

    constructor(name: any, config: ListenBrainzSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('listenbrainz', name, config, internal, emitter);
        this.canPoll = true;
        this.api = new ListenbrainzApiClient(name, config.data);
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

    testAuth = async () => {
        try {
            this.authed = await this.api.testAuth();
        } catch (e) {
            this.logger.error('Could not successfully communicate with Listenbrainz API');
            this.logger.error(e);
            this.authed = false;
        }
        return this.authed;
    }


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        return await this.api.getRecentlyPlayed(limit);
    }
}
