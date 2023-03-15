import {CommonConfig, CommonData, RequestRetryOptions} from "../common.js";

export interface SourceRetryOptions extends RequestRetryOptions {
    /**
     * default # of automatic polling restarts on error
     *
     * @default 5
     * @examples [5]
     * */
    maxPollRetries?: number
}

export interface CommonSourceData extends CommonData, SourceRetryOptions {
}

export interface CommonSourceConfig extends CommonConfig {
    /**
     * Unique identifier for this source.
     * */
    name?: string
    /**
     * Restrict scrobbling tracks played from this source to Clients with names from this list. If list is empty is not present Source scrobbles to all configured Clients.
     *
     * @examples [["MyMalojaConfigName","MyLastFMConfigName"]]
     * */
    clients?: string[]
    data?: CommonSourceData
}

