import YouTubeMusic from "youtube-music-ts-api";

import AbstractSource, {RecentlyPlayedOptions} from "./AbstractSource.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import {IYouTubeMusicAuthenticated} from "youtube-music-ts-api/interfaces-primary";
import dayjs from "dayjs";
import {parseDurationFromTimestamp, playObjDataMatch} from "../utils.js";
import {ITrackDetail} from "youtube-music-ts-api/interfaces-supplementary";
import {YTMusicSourceConfig} from "../common/infrastructure/config/source/ytmusic.js";

export default class YTMusicSource extends AbstractSource {
    apiInstance?: IYouTubeMusicAuthenticated

    requiresAuth = true;

    declare config: YTMusicSourceConfig

    recentlyPlayed: PlayObject[] = [];

    constructor(name: string, config: YTMusicSourceConfig, internal: InternalConfig) {
        super('ytmusic', name, config, internal);
        this.canPoll = true;
    }

    static formatPlayObj(obj: ITrackDetail, newFromSource = false): PlayObject {
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
                trackLength: duration,
                source: 'YTMusic',
                sourceId: id,
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

    protected getLibraryHistory = async () => {
        // internally for this call YT returns a *list* of playlists with decreasing granularity from most recent to least recent like this:
        // * Today
        // * Yesterday
        // * ....
        // * January 2023
        //
        // the playlist returned can therefore change abruptly IE MS started yesterday and new music listened to today -> "today" playlist is cleared
      return await (await this.api()).getLibraryHistory();
    }

    /**
     * Get the last 20 recently played tracks
     * */
    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const playlistDetail = await this.getLibraryHistory();
        const plays = playlistDetail.tracks.map((x) => YTMusicSource.formatPlayObj(x, false)).slice(0, 20);
        if(this.polling === false) {
            this.recentlyPlayed = plays;
        } else {
            let newPlays: PlayObject[] = [];

            // iterate through each play until we find one that matched the "newest" from the recently played
            for (const [i, value] of plays.entries()) {
                if (this.recentlyPlayed.length === 0) {
                    // playlist was empty when we started, nothing to compare to so all tracks are new
                    newPlays.push(value);
                } else if (this.recentlyPlayed.length !== plays.length) { // if there is a difference in list length we need to check for consecutive repeat tracks as well
                    const match = playObjDataMatch(value, this.recentlyPlayed[0]);
                    if (!match) {
                        newPlays.push(value)
                    } else if (match && playObjDataMatch(plays[i + 1], this.recentlyPlayed[0])) { // if it matches but next ALSO matches the current it's a repeat "new"
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

        return this.recentlyPlayed.filter(x => x.meta.newFromSource);
    }

    testAuth = async () => {
        try {
            await this.getRecentlyPlayed();
            this.authed = true;
        } catch (e) {
            this.authed = false;
        }
        return this.authed;
    }

    poll = async (allClients: any) => {
        this.logger.verbose('Hydrating initial recently played tracks for reference.');
        await this.getRecentlyPlayed();
        await this.startPolling(allClients);
    }
}
