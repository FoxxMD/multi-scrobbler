import dayjs from "dayjs";
import EventEmitter from "events";
import { TrackObject, UserGetRecentTracksResponse } from "lastfm-node-client";
import request from "superagent";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.ts";
import { LastfmSourceConfig } from "../common/infrastructure/config/source/lastfm.ts";
import LastfmApiClient from "../common/vendor/LastfmApiClient.ts";
import { sortByOldestPlayDate } from "../utils.ts";
import { RecentlyPlayedOptions } from "./AbstractSource.ts";
import MemorySource from "./MemorySource.ts";

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
        this.supportsUpstreamRecentlyPlayed = true;
        this.supportsUpstreamNowPlaying = true;
        this.api = new LastfmApiClient(name, {...config.data, configDir: internal.configDir, localUrl: internal.localUrl}, {logger: this.logger});
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        // https://www.last.fm/api/show/user.getRecentTracks
        this.SCROBBLE_BACKLOG_COUNT = 200;
        this.logger.info(`Note: The player for this source is an analogue for the 'Now Playing' status exposed by ${this.type} which is NOT used for scrobbling. Instead, the 'recently played' or 'history' information provided by this source is used for scrobbles.`)
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        return LastfmApiClient.formatPlayObj(obj, options);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        return await this.api.initialize();
    }

    protected async doCheckConnection():Promise<true | string | undefined> {
        try {
            await request.get('http://ws.audioscrobbler.com/2.0/');
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                throw new Error('Could not communicate with Last.fm API server', {cause: e});
            } else if(e.status >= 500) {
                throw new Error('Last.fm API server returning an unexpected response', {cause: e})
            }
            return true;
        }
    }
    doAuthentication = async () => {
        try {
            return await this.api.testAuth();
        } catch (e) {
            throw e;
        }
    }


    getLastfmRecentTrack = async(options: RecentlyPlayedOptions = {}): Promise<[PlayObject[], PlayObject[]]> => {
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
        return [history, now];
    }

    getRecentlyPlayed = async(options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            const [history, now] = await this.getLastfmRecentTrack(options);
            this.processRecentPlays(now);
            return  history;
        } catch (e) {
            throw e;
        }
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            const [history, now] = await this.getLastfmRecentTrack(options);
            return history;
        } catch (e) {
            throw e;
        }
    }

    getUpstreamNowPlaying = async (): Promise<PlayObject[]> => {
        try {
            const [history, now] = await this.getLastfmRecentTrack();
            return now;
        } catch (e) {
            throw e;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({formatted: true, ...options})
}
