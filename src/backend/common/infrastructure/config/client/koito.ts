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