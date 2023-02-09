import {CommonClientConfig, CommonClientData} from "./index.js";

export interface LastfmData {
    /**
     * API Key generated from Last.fm account
     * */
    apiKey: string
    /**
     * Secret generated from Last.fm account
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
     * */
    redirectUri?: string
}

export interface LastfmClientConfig extends CommonClientConfig {
    configureAs?: 'client' | 'source'
    data: CommonClientData & LastfmData
}

export interface LastfmClientAIOConfig extends LastfmClientConfig {
    type: 'lastfm'
}
