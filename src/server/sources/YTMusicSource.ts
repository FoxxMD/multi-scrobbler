// @ts-ignore
import YouTubeMusic from "@foxxmd/youtube-music-ts-api";

import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic";
// @ts-ignore
import {IYouTubeMusicAuthenticated} from "@foxxmd/youtube-music-ts-api/interfaces-primary";
import dayjs from "dayjs";
import { parseDurationFromTimestamp, playObjDataMatch } from "../utils";
// @ts-ignore
import {IPlaylistDetail, ITrackDetail} from "@foxxmd/youtube-music-ts-api/interfaces-supplementary";
import { YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic";

export default class YTMusicSource extends AbstractSource {
    apiInstance?: IYouTubeMusicAuthenticated

    requiresAuth = true;

    declare config: YTMusicSourceConfig

    recentlyPlayed: PlayObject[] = [];

    constructor(name: string, config: YTMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('ytmusic', name, config, internal, emitter);
        this.canPoll = true;
    }

    static formatPlayObj(obj: ITrackDetail, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            id,
            title,
            album: albumData,
            artists: artistsData,
            duration: durTimestamp, // string timestamp
        } = obj;

        let artists = undefined,
            album = undefined,
        duration = undefined;
        if(artistsData !== undefined) {
            artists = artistsData.map(x => x.name) as string[];
        }
        if(albumData !== undefined) {
            album = albumData.name;
        }
        if(durTimestamp !== undefined) {
            const durObj = parseDurationFromTimestamp(durTimestamp);
            duration = durObj.asSeconds();
        }
        return {
            data: {
                artists,
                album,
                track: title,
                duration,
                // if object is new from source then we know we've picked it up AFTER we started polling so it can't be older than 1 minute (default polling interval)
                playDate: newFromSource ? dayjs().startOf('minute') : undefined,
            },
            meta: {
                source: 'YTMusic',
                trackId: id,
                newFromSource,
            }
        }
    }

    recentlyPlayedTrackIsValid = (playObj: PlayObject) => {
        return playObj.meta.newFromSource;
    }

    api = async (): Promise<IYouTubeMusicAuthenticated> => {
        if(this.apiInstance !== undefined) {
            return this.apiInstance;
        }
        const ytm = new  YouTubeMusic();
        try {
            this.apiInstance = await ytm.authenticate(this.config.data.cookie, this.config.data.authUser);
        } catch (e: any) {
            this.logger.error('Failed to authenticate', e);
            throw e;
        }
        return this.apiInstance;
    }

    protected getLibraryHistory = async (): Promise<IPlaylistDetail> => {
        // internally for this call YT returns a *list* of playlists with decreasing granularity from most recent to least recent like this:
        // * Today
        // * Yesterday
        // * ....
        // * January 2023
        //
        // the playlist returned can therefore change abruptly IE MS started yesterday and new music listened to today -> "today" playlist is cleared
        try {
            const playlist = await (await this.api()).getLibraryHistory();
            return {tracks: [], ...playlist};
        } catch (e) {
            throw e;
        }
    }

    /**
     * Get the last 20 recently played tracks
     * */
    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const { display = false } = options;

        let playlistDetail: IPlaylistDetail;
        try {
            playlistDetail = await this.getLibraryHistory();
        } catch (e) {
            throw e;
        }

        let newPlays: PlayObject[] = [];

        const plays = playlistDetail.tracks.map((x) => YTMusicSource.formatPlayObj(x, {newFromSource: false})).slice(0, 20);
        if(this.polling === false) {
            this.recentlyPlayed = plays;
            newPlays = plays;
        } else {

            // iterate through each play until we find one that matched the "newest" from the recently played
            for (const [i, value] of plays.entries()) {
                if (this.recentlyPlayed.length === 0) {
                    // playlist was empty when we started, nothing to compare to so all tracks are new
                    newPlays.push(value);
                } else if (this.recentlyPlayed.length !== plays.length) { // if there is a difference in list length we need to check for consecutive repeat tracks as well
                    const match = playObjDataMatch(value, this.recentlyPlayed[0]);
                    if (!match) {
                        newPlays.push(value)
                    } else if (match && plays.length > i + 1 && playObjDataMatch(plays[i + 1], this.recentlyPlayed[0])) { // if it matches but next ALSO matches the current it's a repeat "new"
                        // check if repeated track
                        newPlays.push(value)
                    } else {
                        break;
                    }
                } else if (!playObjDataMatch(value, this.recentlyPlayed[0])) {
                    // if the newest doesn't match a play then the play is new
                    newPlays.push(value);
                } else {
                    // otherwise we're back known plays
                    break;
                }
            }

            if(newPlays.length > 0) {
                newPlays = newPlays.map((x) => {
                    return {
                        data: {
                            ...x.data,
                            playDate: dayjs().startOf('minute')
                        },
                        meta: {
                            ...x.meta,
                            newFromSource: true
                        }
                    }
                });
                this.recentlyPlayed = newPlays.concat(this.recentlyPlayed).slice(0, 20);
            }
        }

        return newPlays;
        
    }

    testAuth = async () => {
        try {
            await this.getRecentlyPlayed();
            this.authed = true;
        } catch (e) {
            if(e.message.includes('Status code: 401')) {
                let hint = 'Verify your cookie and authUser are correct.';
                if(this.config.data.authUser === undefined) {
                    hint = `${hint} TIP: 'authUser' is not defined your credentials. If you are using Chrome to retrieve credentials from music.youtube.com make sure the value from the 'X-Goog-AuthUser' is used as 'authUser'.`;
                }
                this.logger.error(`Authentication failed with the given credentials. ${hint} | Error => ${e.message}`);
            }
            this.authed = false;
        }
        return this.authed;
    }

    onPollPostAuthCheck = async () => {
        if(!this.polling) {
            this.logger.verbose('Hydrating initial recently played tracks for reference.');
            const referencePlays = await this.getRecentlyPlayed();
            const reversedPlays = [...referencePlays];
            // actual order they were discovered in (oldest to newest)
            reversedPlays.reverse();
            if(this.getFlatRecentlyDiscoveredPlays().length === 0) {
                // and add to discovered since its empty
                for(const refPlay of reversedPlays) {
                    this.addPlayToDiscovered(refPlay);
                }
            }
        }
        return true;
    }
}
