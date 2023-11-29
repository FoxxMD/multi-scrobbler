import { RecentlyPlayedOptions } from "./AbstractSource";
import LastfmApiClient from "../common/vendor/LastfmApiClient";
import { sortByOldestPlayDate } from "../utils";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic";
import {TrackObject, UserGetRecentTracksResponse} from "lastfm-node-client";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic";
import MemorySource from "./MemorySource";
import {LastfmSourceConfig} from "../common/infrastructure/config/source/lastfm";
import dayjs from "dayjs";
import {isNodeNetworkException} from "../common/errors/NodeErrors";
import {ErrorWithCause} from "pony-cause";

export default class LastfmSource extends MemorySource {

    api: LastfmApiClient;
    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: LastfmSourceConfig;

    constructor(name: any, config: LastfmSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 15,
                maxInterval = 60,
                ...restData
            } = {}
        } = config;
        super('lastfm', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.api = new LastfmApiClient(name, {...config.data, configDir: internal.configDir, localUrl: internal.localUrl});
        this.playerSourceOfTruth = false;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        return LastfmApiClient.formatPlayObj(obj, options);
    }

    initialize = async () => {
        this.initialized = await this.api.initialize();
        return this.initialized;
    }

    doAuthentication = async () => {
        try {
            return await this.api.testAuth();
        } catch (e) {
            throw e;
        }
    }


    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        const {limit = 20} = options;
        const resp = await this.api.callApi<UserGetRecentTracksResponse>((client: any) => client.userGetRecentTracks({
            user: this.api.user,
            sk: this.api.client.sessionKey,
            limit,
            extended: true
        }));
        const {
            recenttracks: {
                track: list = [],
            }
        } = resp;

        const plays = list.reduce((acc: PlayObject[], x: TrackObject) => {
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
                if(playDate === undefined) {
                    if(nowPlaying === true) {
                        formatted.data.playDate = dayjs();
                        return acc.concat(formatted);
                    }
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
        }, []).sort(sortByOldestPlayDate);
        // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
        // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
        // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
        const history = plays.filter(x => x.meta.nowPlaying !== true);
        const now = plays.filter(x => x.meta.nowPlaying === true);
        this.processRecentPlays(now);
        return history;
    }

    protected getBackloggedPlays = async () => {
        return await this.getRecentlyPlayed({formatted: true});
    }
}
