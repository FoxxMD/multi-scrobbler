import * as z from "zod";
import {koitoDataSchema} from "../client/koito.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const koitoSourceDataSchema = z.object({
    ...koitoDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type KoitoSourceData = z.infer<typeof koitoSourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_KOITO_URL: koitoSourceDataSchema.shape.url,
    SOURCE_KOITO_TOKEN: koitoSourceDataSchema.shape.token,
    SOURCE_KOITO_USER: koitoSourceDataSchema.shape.username,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, KoitoSourceConfig> = {
    env: envDataSchema,
    toConfig: (partial) => ({
            data: {
                url: partial.SOURCE_KOITO_URL,
                token: partial.SOURCE_KOITO_TOKEN,
                username: partial.SOURCE_KOITO_USER
            }
    })
};

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
}).meta({title: "Koito"});

export type KoitoSourceAIOConfig = z.infer<typeof koitoSourceAIOConfigSchema>;
