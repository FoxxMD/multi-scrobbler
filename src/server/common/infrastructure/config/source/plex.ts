import { CommonSourceConfig, CommonSourceData } from "./index";

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

    /**
     * Additional options for Plex/Tautulli logging and tuning
     * */
    options?: {

        /**
         * How MS should log when a Plex/Tautulli event fails a defined filter (users/servers)
         *
         * * `false` => do not log
         * * `debug` => log to DEBUG level
         * * `warn` => log to WARN level (default)
         *
         * Hint: This is useful if you are sure this source is setup correctly and you have multiple other Plex/Tautulli sources. Set to `debug` or `false` to reduce log noise.
         *
         * @default warn
         * @examples ["warn"]
         * */
        logFilterFailure?: false | 'debug' | 'warn'
    }
}

export interface PlexSourceConfig extends CommonSourceConfig {
    data: PlexSourceData
}

export interface PlexSourceAIOConfig extends PlexSourceConfig {
    type: 'plex'
}
