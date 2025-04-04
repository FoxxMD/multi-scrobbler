import { PollingOptions } from "../common.ts";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.ts";

export interface InnertubeOptions {
    /**
     * Proof of Origin token
     * 
     * May be required if YTM starts returning 403
     * 
     * @see https://github.com/yt-dlp/yt-dlp/wiki/Extractors#po-token-guide
     */
    po_token?: string

    /**
     * Visitor ID value found in VISITOR_INFO1_LIVE or visitorData cookie
     * 
     * May be required if YTM starts returning 403
     * 
     * @see https://github.com/yt-dlp/yt-dlp/wiki/Extractors#po-token-guide
     */
    visitor_data?: string

    /**
     * If account login results in being able to choose multiple account, use a zero-based index to choose which one to monitor
     * 
     * @examples [0,1]
     */
    account_index?: number

    location?: string
    lang?: string
    generate_session_locally?: boolean
    device_category?: string
    client_type?: string
    timezone?: string
}

export interface YTMusicData extends CommonSourceData, PollingOptions {
    /**
     * The cookie retrieved from the Request Headers of music.youtube.com after logging in.
     *
     * See https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html#copy-authentication-headers for how to retrieve this value.
     *
     * @examples ["VISITOR_INFO1_LIVE=jMp2xA1Xz2_PbVc; __Secure-3PAPISID=3AxsXpy0M/AkISpjek; ..."]
     * */
    cookie?: string

    /**
     * Google Cloud Console project OAuth Client ID
     * 
     * Generated from a custom OAuth Client, see docs
     */
    clientId?: string
    
    /**
     * Google Cloud Console project OAuth Client Secret
     * 
     * Generated from a custom OAuth Client, see docs
     */
    clientSecret?: string

    /**
     * Google Cloud Console project OAuth Client Authorized redirect URI
     * 
     * Generated from a custom OAuth Client, see docs. multi-scrobbler will generate a default based on BASE_URL.
     * Only specify this if the default does not work for you.
     */
    redirectUri?: string

    /**
     * Additional options for authorization and tailoring YTM client
     */
    innertubeOptions?: InnertubeOptions
}

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
