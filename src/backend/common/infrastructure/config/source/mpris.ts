import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

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

export const mprisDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * DO NOT scrobble from any players that START WITH these values, case-insensitive
     *
     * @examples [["spotify","vlc"]]
     * */
    blacklist: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "DO NOT scrobble from any players that START WITH these values, case-insensitive",
        examples: [["spotify", "vlc"]]
    }),

    /**
     * ONLY from any players that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * @examples [["spotify","vlc"]]
     * */
    whitelist: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "ONLY from any players that START WITH these values, case-insensitive",
        examples: [["spotify", "vlc"]]
    }),
});

export type MPRISData = z.infer<typeof mprisDataSchema>;

export const mprisSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: mprisDataSchema,
});

export type MPRISSourceConfig = z.infer<typeof mprisSourceConfigSchema>;

export const mprisSourceAIOConfigSchema = z.object({
    ...mprisSourceConfigSchema.shape,
    type: z.literal('mpris'),
}).meta({title: 'MPRIS'});

export type MPRISSourceAIOConfig = z.infer<typeof mprisSourceAIOConfigSchema>;
