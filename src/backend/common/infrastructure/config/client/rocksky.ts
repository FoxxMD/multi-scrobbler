import { RequestRetryOptions } from "../common.js";
import { CommonClientConfig, CommonClientData, CommonClientOptions, NowPlayingOptions } from "./index.js";

export interface RockSkyData extends RequestRetryOptions{

    /**
     * API Key generated from [API Applications](https://docs.rocksky.app/migrating-from-listenbrainz-to-rocksky-1040189m0) in Rocksky for your account
     *
     * @examples ["6794186bf-1157-4de6-80e5-uvb411f3ea2b"]
     * */
    key: string

    /**
     * The **fully-qualified** handle for your ATPRoto/Bluesky account, like:
     * 
     * * alice.bsky.social
     * * foxxmd.com
     * * mysuer.blacksky.app
     * 
     * */
    handle: string
}

export interface RockSkyClientData extends RockSkyData, CommonClientData {}

export interface RockSkyOptions {
    /**
     * URL for the Rocksky *Listenbrainz* endpoint, if not using the default
     *
     * @examples ["https://audioscrobbler.rocksky.app"]
     * @default "https://audioscrobbler.rocksky.app"
     * */
    audioScrobblerUrl?: string

    /**
     * URL for the Rocksky *API* endpoint, if not using the default
     *
     * @examples ["https://api.rocksky.app"]
     * @default "https://api.rocksky.app"
     * */
    apiUrl?: string
}

export interface RockSkyClientOptions extends RockSkyOptions, CommonClientOptions, NowPlayingOptions {

}

export interface RockSkyClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using RockSky as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: RockSkyClientData
    options?: RockSkyClientOptions
}

export interface RockSkyClientAIOConfig extends RockSkyClientConfig {
    type: 'rocksky'
}
