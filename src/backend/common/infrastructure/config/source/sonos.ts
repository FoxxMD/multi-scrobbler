import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";
import { envMetaNormalize, transformSplitMaybeString } from "../../../../utils/ZodUtils.ts";

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
     * Only scrobble if device name contains strings from this list
     * */
    devicesAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if device name contains strings from this list"
    }),
    /**
     * Do not scrobble if device name contains strings from this list
     * */
    devicesBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if device name contains strings from this list"
    }),

    /**
     * Only scrobble if the name of a group the playing device belongs to contains strings from this list
     * */
    groupsAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if the name of a group the playing device belongs to contains strings from this list"
    }),
    /**
     * Do not scrobble if the name of a group the playing device belongs to contains strings from this list
     * */
    groupsBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if the name of a group the playing device belongs to contains strings from this list"
    }),
});

export type SonosData = z.infer<typeof sonosDataSchema>;

const envDataSchema = z.object({
    SONOS_HOST: sonosDataSchema.shape.host,
    SONOS_DEVICES_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(sonosDataSchema.shape.devicesAllow.meta())),
    SONOS_DEVICES_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(sonosDataSchema.shape.devicesBlock.meta())),
    SONOS_GROUPS_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(sonosDataSchema.shape.groupsAllow.meta())),
    SONOS_GROUPS_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(sonosDataSchema.shape.groupsBlock.meta())),
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, SonosSourceConfig> = {
    env: envDataSchema,
    prefix: 'SONOS',
    pipe: 'in',
    toConfig: (partial) => ({
            data: {
                host: partial.SONOS_HOST,
                devicesAllow: partial.SONOS_DEVICES_ALLOW,
                devicesBlock: partial.SONOS_DEVICES_BLOCK,
                groupsAllow: partial.SONOS_GROUPS_ALLOW,
                groupsBlock: partial.SONOS_GROUPS_BLOCK
            }
    })
};

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
}).meta({title: 'Sonos'});

export type SonosSourceAIOConfig = z.infer<typeof sonosSourceAIOConfigSchema>;
