import { Second } from "../../../../../core/Atomic.js";
import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface DeezerData extends CommonSourceData, PollingOptions {
    /**
     * deezer client id
     *
     * @examples ["a89cba1569901a0671d5a9875fed4be1"]
     * */
    clientId: string
    /**
     * deezer client secret
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    clientSecret: string
    /**
     * deezer redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/deezer/callback"
     * @examples ["http://localhost:9078/deezer/callback"]
     * */
    redirectUri?: string
}
export interface DeezerSourceConfig extends CommonSourceConfig {
    data: DeezerData
}

export interface DeezerSourceAIOConfig extends DeezerSourceConfig {
    type: 'deezer'
}

export interface DeezerInternalData extends CommonSourceData, PollingOptions {
    /** ARL retrieved from Deezer response header */
    arl: string
    /** User agent
     * 
     * @default "Mozilla/5.0 (X11; Linux i686; rv:135.0) Gecko/20100101 Firefox/135.0"
     */
    userAgent?: string
}

export interface DeezerInternalSourceConfig extends CommonSourceConfig {
    data: DeezerInternalData
}

export interface DeezerInternalAIOConfig extends DeezerInternalSourceConfig {
    type: 'deezer'
}

export type DeezerCompatConfig = DeezerSourceConfig | DeezerInternalSourceConfig;

export interface DeezerInternalTrackData {
    /** Song Id */
    SNG_ID: string
    /** Date listened as unix timestamp in seconds */
    TS: Second
    /** Album Id */
    ALB_ID: string
    /** Album Title */
    ALB_TITLE: string
    /** Album Art Id */
    ALB_PICTURE: string
    /** Artist Id */
    ART_ID: string
    /** Artist Name */
    ART_NAME: string
    /** Song Title */
    SNG_TITLE: string
    /** Time listened to track in seconds */
    DURATION: Second

    __TYPE__: 'song' | string
}