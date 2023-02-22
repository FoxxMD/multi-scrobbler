import YouTubeMusic from "youtube-music-ts-api";

import AbstractSource, {RecentlyPlayedOptions} from "./AbstractSource.js";
import {SourceConfig} from "../common/infrastructure/config/source/sources.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import {IYouTubeMusicAuthenticated} from "youtube-music-ts-api/interfaces-primary";
import dayjs from "dayjs";
import {parseDurationFromTimestamp} from "../utils.js";
import duration from "dayjs/plugin/duration.js";
import {ITrackDetail} from "youtube-music-ts-api/interfaces-supplementary";
import MemorySource from "./MemorySource.js";
import {YTMusicSourceConfig} from "../common/infrastructure/config/source/ytmusic.js";

export default class YTMusicSource extends MemorySource {
    apiInstance?: IYouTubeMusicAuthenticated

    requiresAuth = true;

    declare config: YTMusicSourceConfig

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

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const plays = await (await this.api()).getLibraryHistory();
        return plays.tracks.map((x) => YTMusicSource.formatPlayObj(x, false));
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
}
