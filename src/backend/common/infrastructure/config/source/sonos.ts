import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const sonosDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * IP address of any connected Sonos speaker or device
     *
     * @examples ["192.168.0.170"]
     * */
    host: z.string().meta({
        description: "IP address of any connected Sonos speaker or device",
        examples: ["192.168.0.170"]
    }),

    /**
     * Only scrobble if device name contains strings from this list (case-insensitive)
     * */
    devicesAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if device name contains strings from this list (case-insensitive)"
    }),
    /**
     * Do not scrobble if device name contains strings from this list (case-insensitive)
     * */
    devicesBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if device name contains strings from this list (case-insensitive)"
    }),

    /**
     * Only scrobble if the name of a group the playing device belongs to contains strings from this list (case-insensitive)
     * */
    groupsAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if the name of a group the playing device belongs to contains strings from this list (case-insensitive)"
    }),
    /**
     * Do not scrobble if the name of a group the playing device belongs to contains strings from this list (case-insensitive)
     * */
    groupsBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if the name of a group the playing device belongs to contains strings from this list (case-insensitive)"
    }),
});

export type SonosData = z.infer<typeof sonosDataSchema>;

export const sonosSourceOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    logEmptyPlayer: z.boolean().optional(),
});

export type SonosSourceOptions = z.infer<typeof sonosSourceOptionsSchema>;

export const sonosSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: sonosDataSchema,
    options: sonosSourceOptionsSchema.optional(),
});

export type SonosSourceConfig = z.infer<typeof sonosSourceConfigSchema>;

export const sonosSourceAIOConfigSchema = z.object({
    ...sonosSourceConfigSchema.shape,
    type: z.literal('sonos'),
});

export type SonosSourceAIOConfig = z.infer<typeof sonosSourceAIOConfigSchema>;
