import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface MPDData extends CommonSourceData {
    /**
     * URL:PORT of the MPD server to connect to
     *
     * To use this you must have TCP connections enabled for your MPD server https://mpd.readthedocs.io/en/stable/user.html#client-connections
     *
     * @examples ["localhost:6600"]
     * @default "localhost:6600"
     * */
    url?: string

    /**
     * If using socket specify the path instead of url.
     *
     * trailing `~` is replaced by your home directory
     * */
    path?: string

    /**
     * Password for the server, if set https://mpd.readthedocs.io/en/stable/user.html#permissions-and-passwords
     * */
    password?: string

}

export interface MPDSourceOptions extends CommonSourceOptions {
    //disableDiscovery?: boolean
}

export interface MPDSourceConfig extends CommonSourceConfig {
    data: MPDData
    options: MPDSourceOptions
}

export interface MPDSourceAIOConfig extends MPDSourceConfig {
    type: 'mpd'
}

export type PlayerState = 'play' | 'stop' | 'pause';

export interface StatusResponse {
    state: PlayerState
    /**
     * Position within the current song in seconds
     * */
    elapsed?: number
    /**
     * Duration of the current song in seconds
     * */
    duration?: number
    error?: string
}

export interface CurrentSongResponse {
    file: string
    time: number
    name?: string
    performer?: string
    artist?: string
    album?: string
    albumartist?: string
    title?: string
    musicbrainz_albumartistid?: string
    musicbrainz_albumid?: string
    musicbrainz_artistid?: string
    musicbrainz_releasetrackid?: string
    musicbrainz_trackid?: string
}
