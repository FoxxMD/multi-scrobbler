import { VlcMeta } from "vlc-client/dist/Types.js";
import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface VLCData extends CommonSourceData, PollingOptions {
    /**
     * URL:PORT of the VLC server to connect to
     *
     * To use this you must have Web (http) interface module enabled and a password set https://foxxmd.github.io/multi-scrobbler/docs/configuration#vlc
     *
     * @examples ["localhost:8080"]
     * @default "localhost:8080"
     * */
    url?: string

    /**
     * Password for the server
     * */
    password: string

}

export interface VLCSourceOptions extends CommonSourceOptions {
}

export interface VLCSourceConfig extends CommonSourceConfig {
    data: VLCData
    options: VLCSourceOptions
}

export interface VLCSourceAIOConfig extends VLCSourceConfig {
    type: 'vlc'
}

export type PlayerState = 'playing' | 'stopped' | 'paused';

// if not provided the value is an EMPTY STRING or undefined
export interface VlcAudioMeta extends VlcMeta {
    track_id?: string
    date?: string
    description?: string
    album?: string
    genre?: string
    title?: string
    artist?: string
    /** alt for artist */
    Writer?: string
    ALBUMARTIST?: string
    artwork_url?: string
    StreamTitle?: string
    StreamArtist?: string
    StreamAlbum?: string
}