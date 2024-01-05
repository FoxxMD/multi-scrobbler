import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource";
import { FormatPlayObjectOptions, INITIALIZING, InternalConfig } from "../common/infrastructure/Atomic";
import EventEmitter from "events";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient";
import MemorySource from "./MemorySource";
import {ErrorWithCause} from "pony-cause";
import request from "superagent";
import {isNodeNetworkException} from "../common/errors/NodeErrors";

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

    protected async doCheckConnection(): Promise<boolean> {
        try {
            await request.get(this.api.url);
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                throw new ErrorWithCause('Could not communicate with Listenbrainz API server', {cause: e});
            } else if(e.status !== 410) {
                throw new ErrorWithCause('Listenbrainz API server returning an unexpected response', {cause: e})
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
