import {CommonSourceConfig, CommonSourceData, CommonSourceOptions} from "./index.js";
import {PollingOptions} from "../common.js";

// See issue for more documentation
// https://github.com/FoxxMD/multi-scrobbler/issues/9#issuecomment-946871774
export interface AppleMusicData extends CommonSourceData, PollingOptions {
    /**
     * Contents of MusicKit private key or a path to the key file
     *
     * https://help.apple.com/developer-account/#/devcdfbb56a3
     * */
    key: string

    /**
     * Team Id (tid) from Developer account
     * */
    teamId: string
    /**
     * Key identifier (kid) from Developer account
     * */
    keyId: string

    /**
     *  URL to another MS instance running the apple music source *server*
     * */
    endpoint: string
}

export interface AppleMusicOptions extends CommonSourceOptions {
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

export interface AppleMusicSourceConfig extends CommonSourceConfig {
    data: AppleMusicData
    options?: AppleMusicOptions
}

export interface AppleMusicAIOSourceConfig extends AppleMusicSourceConfig {
    type: 'apple'
}
