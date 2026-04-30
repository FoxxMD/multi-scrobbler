import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface MPDData extends CommonSourceData, PollingOptions {
    /**
     * URL:PORT of the MPD server to connect to
     *
     * To use this you must have TCP connections enabled for your MPD server https://mpd.readthedocs.io/en/stable/user.html#client-connections
     *
     * @examples ["localhost:6600"]
     * @default "localhost:6600"
     * */
    url?: string

    /**
     * If using socket specify the path instead of url.
     *
     * trailing `~` is replaced by your home directory
     * */
    path?: string

    /**
     * Password for the server, if set https://mpd.readthedocs.io/en/stable/user.html#permissions-and-passwords
     * */
    password?: string

}

export interface MPDSourceOptions extends CommonSourceOptions {
    //disableDiscovery?: boolean
}

export interface MPDSourceConfig extends CommonSourceConfig {
    data: MPDData
    options: MPDSourceOptions
}

export interface MPDSourceAIOConfig extends MPDSourceConfig {
    type: 'mpd'
}

export type PlayerState = 'play' | 'stop' | 'pause';