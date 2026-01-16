import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface SonosData extends CommonSourceData, PollingOptions {
    /**
     * IP address of any connected Sonos speaker or device
     *
     * @examples ["192.168.0.170"]
     * */
    host: string

    /**
     * Only scrobble if device name contains strings from this list (case-insensitive)
     * */
    devicesAllow?: string | string[]
    /**
     * Do not scrobble if device name contains strings from this list (case-insensitive)
     * */
    devicesBlock?: string | string[]

    /**
     * Only scrobble if the name of a group the playing device belongs to contains strings from this list (case-insensitive)
     * */
    groupsAllow?: string | string[]
    /**
     * Do not scrobble if the name of a group the playing device belongs to contains strings from this list (case-insensitive)
     * */
    groupsBlock?: string | string[]
}

export interface SonosSourceOptions extends CommonSourceOptions {
    logEmptyPlayer?: boolean
}
export interface SonosSourceConfig extends CommonSourceConfig {
    data: SonosData
    options?: SonosSourceOptions
}

export interface SonosSourceAIOConfig extends SonosSourceConfig {
    type: 'sonos'
}
