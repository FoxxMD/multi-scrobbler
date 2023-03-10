import {CommonClientConfig, CommonClientData} from "./index.js";
import {RequestRetryOptions} from "../common.js";

export interface ListenBrainzClientData extends RequestRetryOptions, CommonClientData {
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

export interface ListenBrainzClientConfig extends CommonClientConfig {
    data: ListenBrainzClientData
}

export interface ListenBrainzClientAIOConfig extends ListenBrainzClientConfig {
    type: 'listenbrainz'
}
