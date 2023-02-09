import {CommonConfig, CommonData, RequestRetryOptions} from "../common.js";

export interface SourceRetryOptions extends RequestRetryOptions {
    /**
     * default # of automatic polling restarts on error
     *
     * @default 0
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
     * Restrict scrobbling tracks played from this source to Clients with names from this list
     * */
    clients?: string[]
    data?: CommonSourceData
}

