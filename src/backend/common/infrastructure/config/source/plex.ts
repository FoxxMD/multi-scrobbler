import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

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
}

export interface PlexApiOptions extends CommonSourceOptions {
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

export interface PlexApiSourceConfig extends CommonSourceConfig {
    data: PlexApiData
    options?: PlexApiOptions
}

export interface PlexApiSourceAIOConfig extends PlexApiSourceConfig {
    type: 'plex'
}

export type PlexCompatConfig = PlexApiSourceConfig;