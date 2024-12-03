import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";
import { Innertube } from 'youtubei.js';

//type InnertubeOptions = Omit<Parameters<typeof Innertube.create>[0], 'cookie' | 'cache' | 'fetch'>;

export interface YTMusicData extends CommonSourceData, PollingOptions {
        /**
     * The cookie retrieved from the Request Headers of music.youtube.com after logging in.
     *
     * See https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html#copy-authentication-headers for how to retrieve this value.
     *
     * @examples ["VISITOR_INFO1_LIVE=jMp2xA1Xz2_PbVc; __Secure-3PAPISID=3AxsXpy0M/AkISpjek; ..."]
     * */
    cookie?: string

    clientId?: string
    
    clientSecret?: string

    redirectUri?: string
}
//export type YTMusicData = YTMusicDataCommon & InnertubeOptions;

export interface YTMusicSourceConfig extends CommonSourceConfig {
    data?: YTMusicData
    options?: CommonSourceOptions & {
        /**
         * When true MS will log to DEBUG all of the credentials data it receives from YTM
         * */
        logAuth?: boolean
        /**
         * Always log history diff
         * 
         * By default MS will log to `WARN` if history diff is inconsistent but does not log if diff is expected (on new tracks found)
         * Set this to `true` to ALWAYS log diff on new tracks. Expected diffs will log to `DEBUG` and inconsistent diffs will continue to log to `WARN`
         * 
         * @default false
         */
        logDiff?: boolean
    }
}

export interface YTMusicSourceAIOConfig extends YTMusicSourceConfig {
    type: 'ytmusic'
}
