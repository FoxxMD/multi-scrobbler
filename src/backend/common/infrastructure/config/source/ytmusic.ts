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
        /**
         * Always log history diff
         * 
         * By default MS will log to `WARN` if history diff is inconsistent but does not log if diff is expected (on new tracks found)
         * Set this to `true` to ALWAYS log diff on new tracks. Expected diffs will log to `DEBUG` and inconsistent diffs will continue to log to `WARN`
         * 
         * @default false
         */
        logDiff?: boolean
    }
}

export interface YTMusicSourceAIOConfig extends YTMusicSourceConfig {
    type: 'ytmusic'
}
