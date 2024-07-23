import { CommonConfig, CommonData, RequestRetryOptions } from "../common.js";

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
}

export interface CommonClientOptions extends RequestRetryOptions {
    /**
     * Try to get fresh scrobble history from client when tracks to be scrobbled are newer than the last scrobble found in client history
     * @default true
     * @examples [true]
     * */
    refreshEnabled?: boolean
    /**
     * Force client to always refresh scrobbled plays from service before scrobbling new play
     *
     * WARNING: This will cause increased load on the scrobble service and potentially slow down scrobble speed as well. This should be used as a debugging tool and not be always-on.
     *
     * @default false
     * @examples [false]
     * */
    refreshForce?: boolean

    /**
     * The number of tracks to retrieve on initial refresh (related to scrobbleBacklogCount). If not specified this is the maximum supported for the client.
     * */
    refreshInitialCount?: number
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

    /**
     * Number of times MS should automatically retry scrobbles in dead letter queue
     *
     * @default 1
     * @examples [1]
     * */
    deadLetterRetries?: number
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
    options?: CommonClientOptions
}
