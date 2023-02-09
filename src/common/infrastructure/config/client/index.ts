import {CommonConfig, CommonData} from "../common";

export interface MatchLoggingOptions {
    onNoMatch?: boolean
    onMatch?: boolean
    confidenceBreakdown?: boolean
}

export interface CommonClientData extends CommonData {
    /**
     * default # of http request retries a client can make before error is thrown.
     *
     * @default 1
     * */
    maxRequestRetries?: number
    /**
     * default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying).
     *
     * @default 1.5
     * */
    retryMultiplier?: number

    options?: {
        refreshEnabled?: boolean
        checkExistingScrobbles?: boolean
        verbose?: {
            match?: MatchLoggingOptions
        }
    }
}

export interface CommonClientConfig extends CommonConfig {
    /**
     * Unique identifier for this client. Used with sources to restrict where scrobbles are sent.
     * */
    name: string
    data?: CommonClientData
}
