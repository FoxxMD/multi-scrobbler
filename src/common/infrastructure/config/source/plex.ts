import {CommonSourceConfig, CommonSourceData} from "./index.js";

export interface PlexSourceData extends CommonSourceData {
    /**
     * optional list of users to scrobble tracks from
     *
     * If none are provided tracks from all users will be scrobbled
     *
     * @examples [["MyUser1", "MyUser2"]]
     * */
    user?: string | string[]
    /**
     * optional list of libraries to scrobble tracks from
     *
     * If none are provided tracks from all libraries will be scrobbled
     *
     * @examples [["Audio","Music"]]
     * */
    libraries?: string | string[]
    /**
     * optional list of servers to scrobble tracks from
     *
     * If none are provided tracks from all servers will be scrobbled
     *
     * @examples [["MyServerName"]]
     * */
    servers?: string | string[]
}

export interface PlexSourceConfig extends CommonSourceConfig {
    data: PlexSourceData
}

export interface PlexSourceAIOConfig extends PlexSourceConfig {
    type: 'plex'
}
