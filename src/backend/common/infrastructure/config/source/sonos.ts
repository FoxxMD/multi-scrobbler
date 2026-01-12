import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface SonosData extends CommonSourceData, PollingOptions {
    /**
     * IP address of any connected Sonos speaker or device
     *
     * @examples ["192.168.0.170"]
     * */
    host: string
}
export interface SonosSourceConfig extends CommonSourceConfig {
    data: SonosData
}

export interface SonosSourceAIOConfig extends SonosSourceConfig {
    type: 'sonos'
}
