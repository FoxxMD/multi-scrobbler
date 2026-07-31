import * as z from "zod";
import {rockSkyDataSchema, rockSkyOptionsSchema} from "../client/rocksky.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";

export const rockskySourceDataSchema = z.object({
    ...rockSkyDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type RockskySourceData = z.infer<typeof rockskySourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_ROCKSKY_KEY: rockskySourceDataSchema.shape.key,
    SOURCE_ROCKSKY_HANDLE: rockskySourceDataSchema.shape.handle,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, RockskySourceConfig> = {
    env: envDataSchema,
    toConfig: (partial) => ({
            data: {
                key: partial.SOURCE_ROCKSKY_KEY,
                handle: partial.SOURCE_ROCKSKY_HANDLE
            }
    })
};

export const rockskySourceOptionsSchema = z.object({
    ...rockSkyOptionsSchema.shape,
    ...commonSourceOptionsSchema.shape,
});

export type RockskySourceOptions = z.infer<typeof rockskySourceOptionsSchema>;

export const rockskySourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    /**
     * When used in `rocksky.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').meta({
        description: "When used in `rocksky.config` this tells multi-scrobbler whether to use this data to configure a source or client.",
        default: "source",
        examples: ["source"]
    }),
    data: rockskySourceDataSchema,
    options: rockskySourceOptionsSchema.optional(),
});

export type RockskySourceConfig = z.infer<typeof rockskySourceConfigSchema>;

export const rockskySourceAIOConfigSchema = z.object({
    ...rockskySourceConfigSchema.shape,
    type: z.literal('rocksky'),
}).meta({title: 'Rocksky'});

export type RockskySourceAIOConfig = z.infer<typeof rockskySourceAIOConfigSchema>;
