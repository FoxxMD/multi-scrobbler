import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";

// all of the required data for the Build Data and Test Auth stages (from Common Development docs)
// should go here
export const coolPlayerData = z.object({
    // make sure to include common source data
    ...commonSourceDataSchema.shape,
    token: z.string().meta({
        description: 'The user-generated token for Cool Player auth created in Cool Player -> Settings -> User -> Tokens',
        examples: ['f243331e-cf5b-49d7-846b-0845bdc965b4']
    }),
    baseUrl: z.string().meta({
        description: 'The host and port where Cool Player is hosted',
        examples: ['http://192.168.0.100:6969']
    })
});
export type CoolPlayeryData = z.infer<typeof coolPlayerData>;

// a default options shape is created from common options
// if you have optional (non-mandatory) behavior or data for configuration
// it should go here
export const coolPlayerOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
});
export type CoolPlayerOptions = z.infer<typeof coolPlayerOptionsSchema>;

// the full Source config is created from the above data/options
export const coolPlayerSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: coolPlayerData,
    options: coolPlayerOptionsSchema.optional(),
});
export type CoolPlayerSourceConfig = z.infer<typeof coolPlayerSourceConfigSchema>;

// if your Source should accept ENVs create them as a separate schema
const envDataSchema = z.object({
    COOL_TOKEN: coolPlayerData.shape.token,
    COOL_URL: coolPlayerData.shape.baseUrl,
});
// and then export an `envSchemas` that returns a normal data schema based on the ENVs
export const envSchemas: EnvSourceSchema<typeof envDataSchema, CoolPlayerSourceConfig> = {
    env: envDataSchema,
    // prefix is used for generic settings that can be applied to this source
    prefix: 'COOL',
    toConfig: (partial) => ({
            data: {
                token: partial.COOL_TOKEN,
                baseUrl: partial.COOL_URL,
            }
    })
};

// finally, the AIO config shape is created with the required `type` constant
export const coolPlayerSourceAIOConfigSchema = z.object({
    ...coolPlayerSourceConfigSchema.shape,
    type: z.literal('coolplayer'),
}).meta({title: 'CoolPlayer'});

export type CoolPlayerSourceAIOConfig = z.infer<typeof coolPlayerSourceAIOConfigSchema>;
