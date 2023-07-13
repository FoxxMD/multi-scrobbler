import {CommonSourceConfig, CommonSourceData} from "./index.js";

export interface JellyData extends CommonSourceData {
    /**
     * optional list of users to scrobble tracks from
     *
     * If none are provided tracks from all users will be scrobbled
     *
     * @examples [["MyUser1","MyUser2"]]
     * */
    users?: string | string[]
    /**
     * optional list of servers to scrobble tracks from
     *
     * If none are provided tracks from all servers will be scrobbled
     *
     * @examples [["MyServerName1"]]
     * */
    servers?: string | string[]

    /**
     * Additional options for jellyfin logging and tuning
     * */
    options?: {
        /**
         * Log raw Jellyfin webhook payload to debug
         *
         * @default false
         * @examples [false]
         * */
        logPayload?: boolean

        /**
         * How MS should log when a Jellyfin event fails a defined filter (users/servers)
         *
         * * `false` => do not log
         * * `debug` => log to DEBUG level
         * * `warn` => log to WARN level (default)
         *
         * Hint: This is useful if you are sure this source is setup correctly and you have multiple other Jellyfin sources. Set to `debug` or `false` to reduce log noise.
         *
         * @default warn
         * @examples ["warn"]
         * */
        logFilterFailure?: false | 'debug' | 'warn'
    }
}

export interface JellySourceConfig extends CommonSourceConfig {
    data: JellyData
}

export interface JellySourceAIOConfig extends JellySourceConfig {
    type: 'jellyfin'
}
