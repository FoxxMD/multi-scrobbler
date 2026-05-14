import { UnixTimestamp } from "../../../core/Atomic.js"

export interface JobParameters {
    /** maximum number of results to get for the entire job */
    fetchMax?: number
    order?: 'asc' | 'desc'
    /** Whether to increment targeted scrobbler client scrobble count */
    countInScrobbler?: boolean
    maxRetries?: number
    /** Whether to keep non-failed plays in db after scrobbling has occurred
     * 
     * * `true` => keep all plays
     * * `false` => keep no plays
     * * number => max number of play to keep based on import date
     */
    keepPlays?: boolean | number
}

export interface JobRangeCount extends JobParameters {
    order: 'asc' | 'desc'
}

export interface JobRangeTime extends JobParameters {
    /** Unix timestamp */
    from: UnixTimestamp
    /** Unix timestamp */
    to: UnixTimestamp
}

// TODO
export interface JobCursor {

}