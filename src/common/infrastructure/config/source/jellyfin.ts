import {CommonSourceConfig, CommonSourceData} from "./index";

export interface JellySourceConfig extends CommonSourceConfig {
    data: CommonSourceData & {
        /**
         * optional list of users to scrobble tracks from
         *
         * If none are provided tracks from all users will be scrobbled
         * */
        user?: string
        /**
         * optional list of servers to scrobble tracks from
         *
         * If none are provided tracks from all servers will be scrobbled
         * */
        servers?: string
    }
}

export interface JellySourceAIOConfig extends JellySourceConfig {
    type: 'jellyfin'
}
