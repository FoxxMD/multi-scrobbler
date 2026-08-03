import * as z from "zod";
import type {VlcMeta} from "vlc-client/dist/Types.js";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";

export const vlcDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * URL:PORT of the VLC server to connect to
     *
     * To use this you must have the Web (http) interface module enabled and a password set
     *
     * @examples ["localhost:8080"]
     * @default "localhost:8080"
     * */
    url: z.string().optional().meta({
        description: "URL:PORT of the VLC server to connect to",
        default: "localhost:8080",
        examples: ["localhost:8080"]
    }),

    /**
     * Password for the server
     * */
    password: z.string().meta({
        description: "Password for the server"
    }),

});

export type VLCData = z.infer<typeof vlcDataSchema>;

const envDataSchema = z.object({
    VLC_URL: vlcDataSchema.shape.url,
    VLC_PASSWORD: vlcDataSchema.shape.password,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, VLCSourceConfig> = {
    env: envDataSchema,
    prefix: 'VLC',
    toConfig: (partial) => ({
            data: {
                url: partial.VLC_URL,
                password: partial.VLC_PASSWORD
            }
    })
};

export const vlcSourceOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    /** A list of regular expressions to use to extract metadata (title, album, artist) from a filename
     *
     * Used when VLC reports only the filename for the current audio track
     * */
    filenamePatterns: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "A list of regular expressions to use to extract metadata (title, album, artist) from a filename"
    }),
    /**
     * Log to DEBUG when a filename-only track is matched or not matched by filenamePatterns
     *
     * @default false
     * */
    logFilenamePatterns: z.boolean().optional().meta({
        description: "Log to DEBUG when a filename-only track is matched or not matched by filenamePatterns",
        default: false
    }),
    /**
     * Dump all the metadata VLC reports for an audio track to DEBUG.
     *
     * Use this if reporting an issue with VLC not correctly capturing metadata for a track.
     *
     * @default false
     * */
    dumpVlcMetadata: z.boolean().optional().meta({
        description: "Dump all the metadata VLC reports for an audio track to DEBUG.",
        default: false
    }),
});

export type VLCSourceOptions = z.infer<typeof vlcSourceOptionsSchema>;

export const vlcSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: vlcDataSchema,
    options: vlcSourceOptionsSchema.optional(),
});

export type VLCSourceConfig = z.infer<typeof vlcSourceConfigSchema>;

export const vlcSourceAIOConfigSchema = z.object({
    ...vlcSourceConfigSchema.shape,
    type: z.literal('vlc'),
}).meta({title: 'VLC'});

export type VLCSourceAIOConfig = z.infer<typeof vlcSourceAIOConfigSchema>;

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
