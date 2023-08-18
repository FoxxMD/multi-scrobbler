import { CommonConfig, CommonData } from "../common";

/**
 * Scrobble matching (between new source track and existing client scrobbles) logging options. Used for debugging.
 * */
export interface MatchLoggingOptions {
    /**
     * Log to DEBUG when a new track does NOT match an existing scrobble
     *
     * @default false
     * @examples [false]
     * */
    onNoMatch?: boolean
    /**
     * Log to DEBUG when a new track DOES match an existing scrobble
     *
     * @default false
     * @examples [false]
     * */
    onMatch?: boolean
    /**
     * Include confidence breakdowns in track match logging, if applicable
     *
     * @default false
     * @examples [false]
     * */
    confidenceBreakdown?: boolean
}

export interface CommonClientData extends CommonData {
    /**
     * default # of http request retries a client can make before error is thrown.
     *
     * @default 1
     * @examples [1]
     * */
    maxRequestRetries?: number
    /**
     * default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying).
     *
     * @default 1.5
     * @examples [1.5]
     * */
    retryMultiplier?: number

    options?: {
        /**
         * Try to get fresh scrobble history from client when tracks to be scrobbled are newer than the last scrobble found in client history
         * @default true
         * @examples [true]
         * */
        refreshEnabled?: boolean
        /**
         * Check client for an existing scrobble at the same recorded time as the "new" track to be scrobbled. If an existing scrobble is found this track is not track scrobbled.
         * @default true
         * @examples [true]
         * */
        checkExistingScrobbles?: boolean
        /**
        * Options used for increasing verbosity of logging in MS (used for debugging)
        * */
        verbose?: {

            match?: MatchLoggingOptions
        }
    }
}

export interface CommonClientConfig extends CommonConfig {
    /**
     * Unique identifier for this client. Used with sources to restrict where scrobbles are sent.
     *
     * @examples ["MyConfig"]
     * */
    name: string
    /**
     * Specific data required to configure this client
     * */
    data?: CommonClientData
}
