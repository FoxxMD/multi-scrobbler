import {CommonSourceConfig, CommonSourceData} from "./index";

export interface PlexSourceConfig extends CommonSourceConfig {
    data: CommonSourceData & {
        /**
         * optional list of users to scrobble tracks from
         *
         * If none are provided tracks from all users will be scrobbled
         * */
        user?: string
        /**
         * optional list of libraries to scrobble tracks from
         *
         * If none are provided tracks from all libraries will be scrobbled
         * */
        libraries?: string
        /**
         * optional list of servers to scrobble tracks from
         *
         * If none are provided tracks from all servers will be scrobbled
         * */
        servers?: string
    }
}

export interface PlexSourceAIOConfig extends PlexSourceConfig {
    type: 'plex'
}
