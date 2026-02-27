import { RequestRetryOptions } from "../common.js";
import { CommonClientConfig, CommonClientData } from "./index.js";

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


/** https://github.com/metabrainz/listenbrainz-server/pull/2572
 * https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/webserver/views/api_tools.py#L48
 */
export const MAX_ITEMS_PER_GET_LZ = 1000;
export const DEFAULT_ITEMS_PER_GET_LZ = 25;
export const DEFAULT_MS_ITEMS_PER_GET_LZ = 100;