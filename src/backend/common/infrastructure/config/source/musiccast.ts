import { REPORTED_PLAYER_STATUSES, ReportedPlayerStatus } from "../../Atomic.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export type PlaybackStatus = 'play' | 'stop' | 'pause' | 'fast_reverse' | 'fast_forward'

export interface MusicCastResponse {
    response_code: number
}

export interface DeviceInfoResponse extends MusicCastResponse {
    model_name: string
    device_id: string
    system_version: number
    api_version: number
}

export interface DeviceStatusResponse extends MusicCastResponse {
    power: 'on' | 'standby'
}

/** use with /netusb/getPlayInfo or /cd/getPlayInfo */
export interface PlayInfoCDResponse extends MusicCastResponse {
    device_status: 'open' | 'close' | 'ready' | 'not_ready'
    playback: 'play' | 'stop' | 'pause' | 'fast_reverse' | 'fast_forward'
    /** in seconds */
    play_time: number
    /** in seconds */
    total_time: number
    artist: string
    album: string
    track: string
}

export interface PlayInfoNetResponse extends PlayInfoCDResponse {
    input: string
}

export const MusicCastResponseCodes = new Map<number, string>([
    [0, 'Success'],
    [1, 'Initializing'],
    [2, 'Internal Error'],
    [3, 'Invalid Request'],
    [4, 'Invalid Parameter'],
    [5, 'Guarded (Unable to setup in current status)'],
    [6, 'Time out'],
    [100, 'Access Error'],
    [101, 'Other Error'],
    [107, 'Service Maintenance'],
    [109, 'License Error'],
    [110, 'Read Only Mode'],
    [112, 'Access Denied'],
    [115, 'Simultaneous logins has reached the upper limit'],
    [200, 'Linking in progress'],
    [201, 'Unlinking in progress']
]);

export const playbackToReportedStatus = (pb: PlaybackStatus): ReportedPlayerStatus => {
    switch(pb) {
        case 'play':
        case 'fast_forward':
        case 'fast_reverse':
            return REPORTED_PLAYER_STATUSES.playing;
        case 'pause':
            return REPORTED_PLAYER_STATUSES.paused;
        case 'stop':
            return REPORTED_PLAYER_STATUSES.stopped;
        default:
            return REPORTED_PLAYER_STATUSES.unknown;
    }
}

export interface MusicCastData extends CommonSourceData {
    /**
     * The host or URL of the YamahaExtendedControl endpoint to use
     *
     * @examples [["192.168.0.101","http://192.168.0.101/YamahaExtendedControl"]]
     * */
    url: string
}

export interface MusicCastSourceConfig extends CommonSourceConfig {
    data: MusicCastData
}

export interface MusicCastSourceAIOConfig extends MusicCastSourceConfig {
    type: 'musiccast'
}
