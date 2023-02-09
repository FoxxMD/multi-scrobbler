import AbstractSource from "./AbstractSource";
import LastfmApiClient from "../apis/LastfmApiClient";
import {sortByPlayDate} from "../utils";
import {LastfmClientConfig} from "../common/infrastructure/config/client/lastfm";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic";
import {UserGetRecentTracksResponse} from "lastfm-node-client";

export default class LastfmSource extends AbstractSource {

    api;
    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: LastfmClientConfig;

    constructor(name: any, config: LastfmClientConfig, internal: InternalConfig) {
        super('lastfm', name, config, internal);
        this.canPoll = true;
        this.api = new LastfmApiClient(name, config.data);
    }

    static formatPlayObj(obj: any): PlayObject {
        return LastfmApiClient.formatPlayObj(obj);
    }

    initialize = async () => {
        this.initialized = await this.api.initialize();
        return this.initialized;
    }

    testAuth = async () => {
        try {
            this.authed = await this.api.testAuth();
        } catch (e) {
            this.logger.error('Could not successfully communicate with Last.fm API');
            this.logger.error(e);
            this.authed = false;
        }
        return this.authed;
    }


    getRecentlyPlayed = async(options = {}) => {
        // @ts-expect-error TS(2339): Property 'limit' does not exist on type '{}'.
        const {limit = 20, formatted = false} = options;
        const resp = await this.api.callApi<UserGetRecentTracksResponse>((client: any) => client.userGetRecentTracks({user: this.api.user, limit, extended: true}));
        const {
            recenttracks: {
                track: list = [],
            }
        } = resp;

        return list.reduce((acc: any, x: any) => {
            try {
                const formatted = LastfmApiClient.formatPlayObj(x);
                const {
                    data: {
                        track,
                        playDate,
                    },
                    meta: {
                        mbid,
                        nowPlaying,
                    }
                } = formatted;
                if(nowPlaying === true) {
                    // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
                    // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
                    // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
                    this.logger.debug("Ignoring 'now playing' track returned from Last.fm client", {track, mbid});
                    return acc;
                } else if(playDate === undefined) {
                    this.logger.warn(`Last.fm recently scrobbled track did not contain a timestamp, omitting from time frame check`, {track, mbid});
                    return acc;
                }
                return acc.concat(formatted);
            } catch (e) {
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                this.logger.warn('Failed to format Last.fm recently scrobbled track, omitting from time frame check', {error: e.message});
                this.logger.debug('Full api response object:');
                this.logger.debug(x);
                return acc;
            }
        }, []).sort(sortByPlayDate);
    }
}
