import {CommonClientConfig, CommonClientData} from "./index.js";
import {RequestRetryOptions} from "../common.js";

export interface ListenBrainzData extends RequestRetryOptions{
    /**
     * URL for the ListenBrainz server, if not using the default
     *
     * @examples ["https://api.listenbrainz.org/"]
     * @default "https://api.listenbrainz.org/"
     * */
    url?: string
    /**
     * User token for the user to scrobble for
     *
     * @examples ["6794186bf-1157-4de6-80e5-uvb411f3ea2b"]
     * */
    token: string

    /**
     * Username of the user to scrobble for
     * */
    username: string
}

export interface ListenBrainzClientData extends ListenBrainzData, CommonClientData {}

export interface ListenBrainzClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Listenbrainz as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: ListenBrainzClientData
}

export interface ListenBrainzClientAIOConfig extends ListenBrainzClientConfig {
    type: 'listenbrainz'
}
