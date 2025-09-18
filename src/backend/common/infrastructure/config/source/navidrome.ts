import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface NavidromeData extends CommonSourceData, PollingOptions {
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
}
export interface NavidromeSourceConfig extends CommonSourceConfig {
    data: NavidromeData
}

export interface NavidromeSourceAIOConfig extends NavidromeSourceConfig {
    type: 'navidrome'
}
