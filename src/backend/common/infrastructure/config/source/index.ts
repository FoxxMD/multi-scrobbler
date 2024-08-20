import { CommonConfig, CommonData, PlayTransformConfig, PlayTransformOptions, RequestRetryOptions } from "../common.js";

export interface SourceRetryOptions extends RequestRetryOptions {
    /**
     * default # of automatic polling restarts on error
     *
     * @default 5
     * @examples [5]
     * */
    maxPollRetries?: number
}

export interface ScrobbleThresholds {
    /**
     * The number of seconds a track has been listened to before it should be considered scrobbled.
     *
     * Set to null to disable.
     *
     * @see https://www.last.fm/api/scrobbling (When is a scrobble a scrobble?)
     * @seehttps://github.com/krateng/maloja/blob/master/API.md#scrobbling-guideline
     *
     * @default 240
     * @examples [240]
     * */
    duration?: number | null
    /**
     * The percentage (as an integer) of a track that should have been seen played before it should be scrobbled. Only used if the Source provides information about how long the track is.
     *
     * Set to null to disable.
     *
     * NOTE: This should be used with care when the Source is a "polling" type (has an 'interval' property). If the track is short and the interval is too high MS may ignore the track if percentage is high because it had not "seen" the track for long enough from first discovery, even if you have been playing the track for longer.
     *
     * @see https://www.last.fm/api/scrobbling (When is a scrobble a scrobble?)
     * @see https://github.com/krateng/maloja/blob/master/API.md#scrobbling-guideline
     *
     * @default 50
     * @examples [50]
     * */
    percent?: number | null
}

export interface CommonSourceOptions extends SourceRetryOptions {
    /**
     * If this source has INGRESS to MS (sends a payload, rather than MS GETTING requesting a payload)
     * then setting this option to true will make MS log the payload JSON to DEBUG output
     *
     * @default false
     * @examples [false]
     * */
    logPayload?: boolean

    /**
     * If this source has INGRESS to MS and has filters this determines how MS logs when a payload (event) fails a defined filter (IE users/servers/library filters)
     *
     * * `false` => do not log
     * * `debug` => log to DEBUG level
     * * `warn` => log to WARN level (default)
     *
     * Hint: This is useful if you are sure this source is setup correctly and you have multiple other sources. Set to `debug` or `false` to reduce log noise.
     *
     * @default warn
     * @examples ["warn"]
     * */
    logFilterFailure?: false | 'debug' | 'warn'

    /**
     * For Sources that track Player State (currently playing) this logs a simple player state/summary to DEBUG output
     *
     * @default false
     * @examples [false]
     * */
    logPlayerState?: boolean

    /**
     * If this source
     *
     * * supports fetching a listen history
     * * and this option is enabled
     *
     * then on startup MS will attempt to scrobble the recent listens from that history
     *
     * @default true
     * @examples [true, false]
     * */
    scrobbleBacklog?: boolean

    /**
     * Set thresholds for when multi-scrobbler should consider a tracked play to be "scrobbable". If both duration and percent are defined then if either condition is met the track is scrobbled.
     * */
    scrobbleThresholds?: ScrobbleThresholds

    /**
     * The number of listens to fetch when scrobbling from backlog
     *
     * * Only applies if this source supports fetching a listen history
     * * If not specified it defaults to the maximum number of listens the source API supports
     * */
    scrobbleBacklogCount?: number

    playTransform?: PlayTransformOptions
}

export interface CommonSourceData extends CommonData {

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
    options?: CommonSourceOptions
}

