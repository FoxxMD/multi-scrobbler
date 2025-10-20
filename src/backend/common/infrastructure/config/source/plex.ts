import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

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

export interface PlexApiData extends CommonSourceData, PollingOptions {
    token?: string
    /**
     * http(s)://HOST:PORT of the Plex server to connect to
     * */
    url: string

        /**
     * Only scrobble for specific users (case-insensitive)
     *
     * If `true` MS will scrobble activity from all users
     * */
        usersAllow?: string | true | string[]
        /**
         * Do not scrobble for these users (case-insensitive)
         * */
        usersBlock?: string | string[]
    
        /**
         * Only scrobble if device or application name contains strings from this list (case-insensitive)
         * */
        devicesAllow?: string | string[]
        /**
         * Do not scrobble if device or application name contains strings from this list (case-insensitive)
         * */
        devicesBlock?: string | string[]
    
        /**
         * Only scrobble if library name contains string from this list (case-insensitive)
         * */
        librariesAllow?: string | string[]
        /**
         * Do not scrobble if library name contains strings from this list (case-insensitive)
         * */
        librariesBlock?: string | string[]

        /**
         * Ignore invalid cert errors when connecting to Plex
         * 
         * Useful for Plex servers using "Required" Secure Connections with self-signed certificates
         * 
         * Do not enable unless you know you need this.
         * 
         * @default false
         */
        ignoreInvalidCert?: boolean
}

export interface PlexApiOptions extends CommonSourceOptions {
}

export interface PlexApiSourceConfig extends CommonSourceConfig {
    data: PlexApiData
    options: PlexApiOptions
}

export interface PlexApiSourceAIOConfig extends PlexApiSourceConfig {
    type: 'plex'
}

export type PlexCompatConfig = PlexApiSourceConfig | PlexSourceConfig;