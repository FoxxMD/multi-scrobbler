import { PlayTransformConfig, PlayTransformOptions } from "../../Atomic.js";
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

export interface UpstreamRefreshOptions {
    /**
     * Try to get fresh scrobble history from client when tracks to be scrobbled are newer than the last scrobble found in client history
     * @default true
     * @examples [true]
     * */
    refreshEnabled?: boolean
    /**
     * Refresh scrobbled plays from upstream service if last refresh was at least X seconds ago
     *
     * **In most case this setting does NOT need to be changed.** The default value is sufficient for the majority of use-cases. Increasing this setting may increase upstream service load and slow down scrobbles.
     *
     * This setting should only be changed in specific scenarios where MS is handling multiple "relaying" client-services (IE lfm -> lz -> lfm) and there is the potential for a client to be out of sync after more than a few seconds.
     *
     * @examples [60]
     * @default 60
     * */
    refreshStaleAfter?: number

    /**
     * Minimum time (milliseconds) required to pass before upstream scrobbles can be refreshed.
     *
     * **In most case this setting does NOT need to be changed.** This will always be equal to or smaller than `refreshStaleAfter`.
     *
     * @default 5000
     * @examples [5000]
     * */
    refreshMinInterval?: number

    /**
     * The number of tracks to retrieve on initial refresh (related to scrobbleBacklogCount). If not specified this is the maximum supported by the client in 1 API call.
     * */
    refreshInitialCount?: number
}

export interface CommonClientOptions extends RequestRetryOptions, UpstreamRefreshOptions {

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

    playTransform?: PlayTransformOptions
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
