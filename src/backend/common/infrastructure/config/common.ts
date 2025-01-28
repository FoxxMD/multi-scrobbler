import { keyOmit } from "../Atomic.js";

export interface CommonConfig {
    name?: string
    data?: CommonData
    /**
     * Should MS use this client/source? Defaults to true
     *
     * @default true
     * @examples [true]
     * */
    enable?: boolean
}

export type CommonData = keyOmit<{ [key: string]: any }, "options">

export interface RequestRetryOptions {
    /**
     * default # of http request retries a source/client can make before error is thrown
     *
     * @default 1
     * @examples [1]
     * */
    maxRequestRetries?: number
    /**
     * default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying)
     *
     * @default 1.5
     * @examples [1.5]
     * */
    retryMultiplier?: number
}

export interface PollingOptions {

    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * @default 10
     * @examples [10]
     * */
    interval?: number

    /**
     * When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)
     *
     * @default 30
     * @examples [30]
     * */
    maxInterval?: number

    /**
     * Number of seconds after which A Player is considered Stale
     * 
     * When Polling the source does not recieve data about a specific Player after X seconds it becomes Stale. When the Player becomes Stale:
     * 
     * * The current listening session is ended. If the Player becomes active again a new listening session is started (Player will miss `interval` seconds of listening)
     * * If the player has an existing session w/ track then MS attempts to scrobble it
     * 
     * This option DOES NOT need to be set. It is automatically calculated as (`interval` * 3) when not defined.
     */
    staleAfter?: number

    /**
     * Number of seconds after which A Player is considered Orphaned
     * 
     * When Polling the source does not recieve data about a specific Player after X seconds it becomes Orphaned. When the Player becomes Orphaned:
     * 
     * * The current Player session is ended and the Player is removed from MS
     * * MS attempts to scrobble, if the Player has an existing session w/ track
     * 
     * A Player should become Orphaned EQUAL TO OR AFTER it becomes Stale.
     * 
     * * This option DOES NOT need to be set. It is automatically calculated as (`interval` * 5) when not defined.
     * * If it is set it must be equal to or larger than `staleAfter` or (`interval * 3`)
     */
     orphanedAfter?: number
}

