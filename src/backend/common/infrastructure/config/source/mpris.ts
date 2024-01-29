import { CommonSourceConfig, CommonSourceData } from "./index.js";

export const PLAYBACK_STATUS_PLAYING = 'Playing';
export const PLAYBACK_STATUS_PAUSED = 'Paused';
export const PLAYBACK_STATUS_STOPPED = 'Stopped';

export type PlaybackStatus = 'Playing' | 'Paused' | 'Stopped';

export const MPRIS_IFACE = 'org.mpris.MediaPlayer2.Player';
export const MPRIS_PATH = '/org/mpris/MediaPlayer2';
export const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

export interface MPRISMetadata {
    trackid?: string
    length?: number
    artUrl?: string
    album?: string
    albumArtist?: string[]
    artist?: string[]
    title?: string
    url?: string
}

export interface PlayerInfo {
    name: string
    status: PlaybackStatus
    position?: number
    metadata: MPRISMetadata
}

export interface MPRISData extends CommonSourceData {
    /**
     * DO NOT scrobble from any players that START WITH these values, case-insensitive
     *
     * @examples [["spotify","vlc"]]
     * */
    blacklist?: string | string[]

    /**
     * ONLY from any players that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * @examples [["spotify","vlc"]]
     * */
    whitelist?: string | string[]
}

export interface MPRISSourceConfig extends CommonSourceConfig {
    data: MPRISData
}

export interface MPRISSourceAIOConfig extends MPRISSourceConfig {
    type: 'mpris'
}
