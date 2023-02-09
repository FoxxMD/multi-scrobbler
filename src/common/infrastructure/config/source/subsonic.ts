import {CommonSourceConfig, CommonSourceData} from "./index";

export interface SubsonicData extends CommonSourceData {
    /**
     * URL of the subsonic media server to query
     * */
    url: string
    user: string
    password: string
}
export interface SubSonicSourceConfig extends CommonSourceConfig {
    data: SubsonicData
}

export interface SubsonicSourceAIOConfig extends SubSonicSourceConfig {
    type: 'subsonic'
}
