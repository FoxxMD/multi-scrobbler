import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface YTMusicCredentials {
    /**
     * The cookie retrieved from the Request Headers of music.youtube.com after logging in.
     *
     * See https://github.com/nickp10/youtube-music-ts-api/blob/master/DOCUMENTATION.md#authenticate and https://ytmusicapi.readthedocs.io/en/latest/setup.html#copy-authentication-headers for how to retrieve this value.
     *
     * @examples ["VISITOR_INFO1_LIVE=jMp2xA1Xz2_PbVc; __Secure-3PAPISID=3AxsXpy0M/AkISpjek; ..."]
     * */
    cookie: string
    /**
     * If the 'X-Goog-AuthUser' header is present in the Request Headers for music.youtube.com it must also be included
     *
     * @example [0]
     * */
    authUser?: number | string
}

export interface YTMusicData extends YTMusicCredentials, CommonSourceData, PollingOptions {
}
export interface YTMusicSourceConfig extends CommonSourceConfig {
    data: YTMusicData
    options?: CommonSourceOptions & {
        /**
         * When true MS will log to DEBUG what parts of the cookie are updated by YTM
         * */
        logAuthUpdateChanges?: boolean
    }
}

export interface YTMusicSourceAIOConfig extends YTMusicSourceConfig {
    type: 'ytmusic'
}
