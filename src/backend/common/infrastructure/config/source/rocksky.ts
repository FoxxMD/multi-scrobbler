import * as z from "zod";
import {rockSkyDataSchema, rockSkyOptionsSchema} from "../client/rocksky.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const rockskySourceDataSchema = z.object({
    ...rockSkyDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type RockskySourceData = z.infer<typeof rockskySourceDataSchema>;

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
});

export type RockskySourceAIOConfig = z.infer<typeof rockskySourceAIOConfigSchema>;
