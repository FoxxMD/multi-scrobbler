import * as z from "zod";
import {rockSkyDataSchema, rockSkyOptionsSchema} from "../client/rocksky.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";

export const rockskySourceDataSchema = z.object({
    handle: rockSkyDataSchema.shape.handle.meta(rockSkyDataSchema.shape.handle.meta() ?? {}),
    ...pollingOptionsSchema.shape,
    ...commonSourceDataSchema.shape,
});

export type RockskySourceData = z.infer<typeof rockskySourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_ROCKSKY_HANDLE: rockskySourceDataSchema.shape.handle,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, RockskySourceConfig> = {
    env: envDataSchema,
    prefix: 'SOURCE_ROCKSKY',
    toConfig: (partial) => ({
            configureAs: 'source',
            data: {
                handle: partial.SOURCE_ROCKSKY_HANDLE
            }
    })
};

export const rockskySourceOptionsSchema = z.object({
    ...rockSkyOptionsSchema.shape,
    ...commonSourceOptionsSchema.shape,
});

export type RockskySourceOptions = z.infer<typeof rockskySourceOptionsSchema>;

const {enable, clients, options, ...commonConfigPrimary} = commonSourceConfigSchema.shape;

export const rockskySourceConfigSchema = z.object({
    ...commonConfigPrimary,
    data: rockskySourceDataSchema,
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
    enable,
    clients,
    options: rockskySourceOptionsSchema.optional(),
});

export type RockskySourceConfig = z.infer<typeof rockskySourceConfigSchema>;

export const rockskySourceAIOConfigSchema = z.object({
    type: z.literal('rocksky'),
    ...rockskySourceConfigSchema.shape,
    // can be optional since it always appears in a source array
    configureAs: rockskySourceConfigSchema.shape.configureAs.optional(),
}).meta({title: 'Rocksky'});

export type RockskySourceAIOConfig = z.infer<typeof rockskySourceAIOConfigSchema>;
