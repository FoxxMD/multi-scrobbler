import {CommonSourceConfig, CommonSourceData} from "./index.js";

export interface SubsonicData extends CommonSourceData {
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
export interface SubSonicSourceConfig extends CommonSourceConfig {
    data: SubsonicData
}

export interface SubsonicSourceAIOConfig extends SubSonicSourceConfig {
    type: 'subsonic'
}
