import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface AzuraStationInfoResponse {
    id: string
    name: string
    shortcode: string
    is_public: boolean
}

export interface AzuraListenersResponse {
    total: number
    unique: number
    current: number
}

export interface AzuraSongResponse {
    id: string
    text: string
    artist: string
    title: string
    album: string
    genre: string
    isrc: string
}

export interface AzuraNowPlayingResponse {
    sh_id: number
    played_at: number
    duration: number
    streamer: string
    elapsed: number
    remaining: number
    song: AzuraSongResponse
}

export interface AzuraLiveResponse {
    is_live: boolean
    streamer_name: string
    broadcast_start: number | null
}

export interface AzuraStationResponse {
    is_online: boolean
    station: AzuraStationInfoResponse
    listeners: AzuraListenersResponse
    now_playing: AzuraNowPlayingResponse
}


export interface AzuracastData extends CommonSourceData {
    /**
     * Base URL of the Azuracast instance
     *
     * This does NOT include the station. If a station is included it will be ignored. Use `station` field to specify station, if necessary
     *
     *
     * @examples ["https://radio.mydomain.tld", "http://localhost:80"]
     * */
    url: string

    /**
     * The specific station to monitor
     * 
     * Scrobbling will only occur if any of the monitor conditions are met AND the station is ONLINE.
     * 
     * To monitor multiple stations create a Source for each station.
     *
     * @examples ["my-station-1"]
     * */
    station: string

    /**
     * Only activate scrobble monitoring if station
     * 
     * * `true` => has any current listeners
     * * `number` => has EQUAL TO or MORE THAN X number of listeners
     * 
     */
    monitorWhenListeners?: boolean | number

    /**
     * Only activate scrobble monitoring if station has a live DJ/Streamer
     */
    monitorWhenLive?: boolean

    /**
     * API Key used to access data about private streams
     *
     * https://www.azuracast.com/docs/developers/apis/#api-authentication
     * */
    apiKey?: string
}

export interface AzuracastSourceConfig extends CommonSourceConfig {
    data: AzuracastData
}

export interface AzuracastSourceAIOConfig extends AzuracastSourceConfig {
    type: 'azuracast'
}
