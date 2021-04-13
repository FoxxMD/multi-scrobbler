import AbstractSource from "./AbstractSource.js";
import LastfmApiClient from "../apis/LastfmApiClient.js";
import {sortByPlayDate} from "../utils.js";

export default class LastfmSource extends AbstractSource {

    api;
    initialized = false;

    constructor(name, config = {}, clients = []) {
        super('lastfm', name, config, clients);
        this.canPoll = true;
        this.api = new LastfmApiClient(name, config);
    }

    static formatPlayObj(obj) {
        return LastfmApiClient.formatPlayObj(obj);
    }

    initialize = async () => {
        this.initialized = await this.api.initialize();
        return this.initialized;
    }

    getRecentlyPlayed = async(options = {}) => {
        const {limit = 20, formatted = false} = options;
        const resp = await this.api.callApi(client => client.userGetRecentTracks({user: this.api.user, limit, extended: true}));
        const {
            recenttracks: {
                track: list = [],
            }
        } = resp;

        return list.reduce((acc, x) => {
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
                this.logger.warn('Failed to format Last.fm recently scrobbled track, omitting from time frame check', {error: e.message});
                this.logger.debug('Full api response object:');
                this.logger.debug(x);
                return acc;
            }
        }, []).sort(sortByPlayDate);
    }
}
