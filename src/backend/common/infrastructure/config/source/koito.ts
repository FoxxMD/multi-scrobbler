import * as z from "zod";
import {koitoDataSchema} from "../client/koito.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const koitoSourceDataSchema = z.object({
    ...koitoDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type KoitoSourceData = z.infer<typeof koitoSourceDataSchema>;

export const koitoSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    /**
     * When used in `koito.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').meta({
        description: "When used in `koito.config` this tells multi-scrobbler whether to use this data to configure a source or client.",
        default: "source",
        examples: ["source"]
    }),
    data: koitoSourceDataSchema,
});

export type KoitoSourceConfig = z.infer<typeof koitoSourceConfigSchema>;

export const koitoSourceAIOConfigSchema = z.object({
    ...koitoSourceConfigSchema.shape,
    type: z.literal('koito'),
});

export type KoitoSourceAIOConfig = z.infer<typeof koitoSourceAIOConfigSchema>;
