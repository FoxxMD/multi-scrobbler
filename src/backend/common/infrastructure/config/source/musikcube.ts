import { CommonSourceConfig, CommonSourceData } from "./index.js";

export const PLAYBACK_STATUS_PLAYING_MC = 'playing';
export const PLAYBACK_STATUS_PAUSED_MC = 'paused';
export const PLAYBACK_STATUS_STOPPED_MC = 'stopped';

export type MCPlaybackStatus = 'playing' | 'stopped' | 'paused';

export interface MCResponseCommon {
    id: string
    name: string
    type: 'response'
}

export interface MCRequestCommon {
    type: 'request'
    id: string
    name: string
}

export interface MCTrackResponse {
    album: string
    album_artist: string
    album_artist_id: number
    album_id: number
    artist: string
    artist_id: number
    external_id: string
    genre: string
    genre_id: number
    id: number
    thumbnail_id: number
    title: string
    track: number
}

export interface MCPlaybackOverviewResponse extends MCResponseCommon {
    options: {
        muted: boolean
        play_queue_position: number
        playing_current_time: number
        playing_duration: number
        playing_track: MCTrackResponse
        repeat_mode: string
        shuffled: boolean
        state: MCPlaybackStatus
        track_count: number
        volume: number
    }
}

export interface MCAuthenticateResponse extends MCResponseCommon {
    options: {
        authenticated: boolean
        environment: {
            api_version: number
            app_version: string
            http_server_enabled: boolean
            http_server_port: number
            sdk_version: number
        }
    }
}

export interface MCAuthenticateRequest extends MCRequestCommon {
    name: 'authenticate',
    device_id: string
    options: {
        password: string
    }
}

export interface MCPlaybackOverviewRequest extends MCRequestCommon {
    name: 'get_playback_overview'
    device_id: string
}

export interface MusikcubeData extends CommonSourceData {
    /**
     * URL of the Musikcube Websocket (Metadata) server to connect to
     *
     * You MUST have enabled 'metadata' server and set a password: https://github.com/clangen/musikcube/wiki/remote-api-documentation
     *   * musikcube -> settings -> server setup
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `ws://`
     * * Hostname => `localhost`
     * * Port => `7905`
     *
     *
     * @examples ["ws://localhost:7905"]
     * @default "ws://localhost:7905"
     * */
    url?: string

    /**
     * Password set in Musikcube https://github.com/clangen/musikcube/wiki/remote-api-documentation
     *
     * * musikcube -> settings -> server setup -> password
     * */
    password: string

    device_id?: string

}

export interface MusikcubeSourceConfig extends CommonSourceConfig {
    data: MusikcubeData
}

export interface MusikcubeSourceAIOConfig extends MusikcubeSourceConfig {
    type: 'musikcube'
}
