import { RequestRetryOptions } from "../common.js"
import { CommonClientConfig, CommonClientData } from "./index.js"

export interface ListensResponse {
    items: ListenObjectResponse[]
    total_record_count: number
    items_per_page: number
    has_next_page: boolean
    current_page: number
}

export interface ListenObjectResponse {
    /** ISO8601 timestamp */
    time: string
    track: TrackResponse
}

export interface TrackResponse {
    id: number
    title: string
    artists: ArtistResponse[]
    musicbrainz_id: string | null
    listen_count: number
    duration: number
    image: string | null
    album_id: number
    time_listened: number
}

export interface ArtistResponse {
    id: number
    name: string
}

export interface KoitoData extends RequestRetryOptions {
    /**
     * URL for the Koito server
     *
     * @examples ["http://192.168.0.100:4110"]
     * */
    url: string
    /**
     * User token for the user to scrobble for
     *
     * @examples ["pM195xPV98CDpk0QW47FIIOR8AKATAX5DblBF-Jq0t1MbbKL"]
     * */
    token: string

    /**
     * Username of the user to scrobble for
     * */
    username: string
}

export interface KoitoClientData extends KoitoData, CommonClientData {}

export interface KoitoClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Koito as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: KoitoClientData
}

export interface KoitoClientAIOConfig extends KoitoClientConfig {
    type: 'koito'
}