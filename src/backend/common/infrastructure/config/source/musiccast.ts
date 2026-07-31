import * as z from "zod";
import { REPORTED_PLAYER_STATUSES } from '../../../../../core/Atomic.ts';
import type {ReportedPlayerStatus} from '../../../../../core/Atomic.ts';
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

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

export const musicCastDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * The host or URL of the YamahaExtendedControl endpoint to use
     *
     * @examples [["192.168.0.101","http://192.168.0.101/YamahaExtendedControl"]]
     * */
    url: z.string().meta({
        description: "The host or URL of the YamahaExtendedControl endpoint to use",
        examples: [["192.168.0.101", "http://192.168.0.101/YamahaExtendedControl"]]
    }),
});

export type MusicCastData = z.infer<typeof musicCastDataSchema>;

const envDataSchema = z.object({
    MCAST_URL: musicCastDataSchema.shape.url,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, MusicCastSourceConfig> = {
    env: envDataSchema,
    prefix: 'MCAST',
    toConfig: (partial) => ({
            data: {
                url: partial.MCAST_URL
            }
    })
};

export const musicCastSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: musicCastDataSchema,
});

export type MusicCastSourceConfig = z.infer<typeof musicCastSourceConfigSchema>;

export const musicCastSourceAIOConfigSchema = z.object({
    ...musicCastSourceConfigSchema.shape,
    type: z.literal('musiccast'),
}).meta({title: 'Musiccast'});

export type MusicCastSourceAIOConfig = z.infer<typeof musicCastSourceAIOConfigSchema>;
