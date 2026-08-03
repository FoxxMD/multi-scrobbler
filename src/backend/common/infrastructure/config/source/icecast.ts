import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, manualListeningOptionsSchema, type EnvSourceSchema} from "./index.ts";

export interface IcecastMetadata {
    icy?: {
        /** Title of the ICY metadata update, usually Artist - Title */
        StreamTitle?: string
        /** URL of the ICY metadata update, usually album art */
        StreamUrl?: string
    }
    ogg?: {
        /** Title of the OGG metadata update, usually Artist - Title */
        TITLE?: string
        ALBUM?: string
        ARTIST?: string
    }
}

export const icecastSourceSchema = z.union([z.literal('icy'), z.literal('ogg'), z.literal('icestats'), z.literal('stats'), z.literal('sevenhtml'), z.literal('nextsongs')]);

export type IcecastSource = z.infer<typeof icecastSourceSchema>;

export const icecastOptionsSchema = z.object({
    sources: z.array(icecastSourceSchema).optional(),
    icestatsEndpoint: z.string().optional(),
    statsEndpoint: z.string().optional(),
    nextsongsEndpoint: z.string().optional(),
    sevenhtmlEndpoint: z.string().optional(),
    icyMetaInt: z.number().optional(),
});

export type IcecastOptions = z.infer<typeof icecastOptionsSchema>;

export const icecastDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...icecastOptionsSchema.shape,
    /**
     * The Icecast stream URL
     * */
    url: z.string().meta({
        description: "The Icecast stream URL"
    }),
});

export type IcecastData = z.infer<typeof icecastDataSchema>;

const envDataSchema = z.object({
    ICECAST_URL: icecastDataSchema.shape.url,
    ICECAST_AUTO_MONITOR: z.stringbool().optional()
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, IcecastSourceConfig> = {
    env: envDataSchema,
    prefix: 'ICECAST',
    toConfig: (partial) => ({
            data: {
                url: partial.ICECAST_URL
            },
            options: {
                autoMonitor: partial.ICECAST_AUTO_MONITOR
            }
    })
};

export const icecastSourceOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    ...manualListeningOptionsSchema.shape,
});

export type IcecastSourceOptions = z.infer<typeof icecastSourceOptionsSchema>;

export const icecastSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: icecastDataSchema,
    options: icecastSourceOptionsSchema.optional(),
});

export type IcecastSourceConfig = z.infer<typeof icecastSourceConfigSchema>;

export const icecastSourceAIOConfigSchema = z.object({
    ...icecastSourceConfigSchema.shape,
    type: z.literal('icecast'),
}).meta({title: 'Icecast'});

export type IcecastSourceAIOConfig = z.infer<typeof icecastSourceAIOConfigSchema>;
