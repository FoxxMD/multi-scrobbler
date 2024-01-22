import { CommonSourceConfig, CommonSourceData } from "./index.js";
import { PollingOptions } from "../common.js";

export interface SubsonicData extends CommonSourceData, PollingOptions {
    /**
     * URL of the subsonic media server to query
     *
     * @examples ["http://airsonic.local"]
     * */
    url: string
    /**
     * Username to login to the server with
     *
     * @example ["MyUser"]
     * */
    user: string

    /**
    * Password for the user to login to the server with
     *
     * @examples ["MyPassword"]
    * */
    password: string

    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * @default 10
     * @examples [10]
     * */
    interval?: number

    /**
     * When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)
     *
     * @default 30
     * @examples [30]
     * */
    maxInterval?: number
}
export interface SubSonicSourceConfig extends CommonSourceConfig {
    data: SubsonicData
}

export interface SubsonicSourceAIOConfig extends SubSonicSourceConfig {
    type: 'subsonic'
}
