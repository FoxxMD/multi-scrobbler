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

export interface ScrobbleThresholds {
    /**
     * The number of seconds before a track should be considered scrobbled.
     *
     * @default 30
     * @examples [30]
     * */
    duration?: number
    /**
     * The percentage of a track that should have been seen played before it should be scrobbled. Only used if the Source provides information about how long the track is.
     *
     * NOTE: This should be used with care when the Source is a "polling" type (has an 'interval' property). If the track is short and the interval is too high MS may ignore the track if percentage is high because it had not "seen" the track for long enough from first discovery, even if you have been playing the track for longer.
     * */
    percent?: number
}

export interface CommonSourceData extends CommonData, SourceRetryOptions {
    /**
     * Set thresholds for when multi-scrobbler should consider a tracked play to be "scrobbable". If both duration and percent are defined then if either condition is met the track is scrobbled.
     * */
    scrobbleThresholds?: ScrobbleThresholds
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

