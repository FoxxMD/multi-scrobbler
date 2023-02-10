import {CommonSourceConfig, CommonSourceData} from "./index.js";

export interface JellyData extends CommonSourceData {
    /**
     * optional list of users to scrobble tracks from
     *
     * If none are provided tracks from all users will be scrobbled
     * */
    users?: string | string[]
    /**
     * optional list of servers to scrobble tracks from
     *
     * If none are provided tracks from all servers will be scrobbled
     * */
    servers?: string | string[]
}

export interface JellySourceConfig extends CommonSourceConfig {
    data: JellyData
}

export interface JellySourceAIOConfig extends JellySourceConfig {
    type: 'jellyfin'
}
