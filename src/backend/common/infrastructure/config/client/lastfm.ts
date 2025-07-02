import { RequestRetryOptions } from "../common.js";
import { CommonClientConfig, CommonClientData, CommonClientOptions, NowPlayingOptions } from "./index.js";

export interface LastfmData extends CommonClientData, RequestRetryOptions {
    /**
     * API Key generated from Last.fm account
     *
     * @examples ["787c921a2a2ab42320831aba0c8f2fc2"]
     * */
    apiKey: string
    /**
     * Secret generated from Last.fm account
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    secret: string
    /**
     * Optional session id returned from a completed auth flow
     * */
    session?: string
    /**
     * Optional URI to use for callback. Specify this if callback should be different than the default. MUST have "lastfm/callback" in the URL somewhere.
     *
     * @default "http://localhost:9078/lastfm/callback"
     * @examples ["http://localhost:9078/lastfm/callback"]
     * */
    redirectUri?: string
}

export interface LastfmClientOptions extends CommonClientOptions, NowPlayingOptions {

}

export interface LastfmClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using LastFM as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: LastfmData
    options?: LastfmClientOptions
}

export interface LastfmClientAIOConfig extends LastfmClientConfig {
    type: 'lastfm'
}
