import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface YTMusicData extends CommonSourceData, PollingOptions {
}
export interface YTMusicSourceConfig extends CommonSourceConfig {
    data?: YTMusicData
    options?: CommonSourceOptions & {
        /**
         * When true MS will log to DEBUG all of the credentials data it receives from YTM
         * */
        logAuth?: boolean
    }
}

export interface YTMusicSourceAIOConfig extends YTMusicSourceConfig {
    type: 'ytmusic'
}
