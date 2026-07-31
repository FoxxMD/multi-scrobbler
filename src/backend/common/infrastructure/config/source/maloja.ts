import * as z from "zod";
import {malojaDataSchema} from "../client/maloja.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const malojaSourceDataSchema = z.object({
    ...malojaDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type MalojaSourceData = z.infer<typeof malojaSourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_MALOJA_URL: malojaSourceDataSchema.shape.url,
    SOURCE_MALOJA_API_KEY: malojaSourceDataSchema.shape.apiKey,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, MalojaSourceConfig> = {
    env: envDataSchema,
    toConfig: (partial) => ({
            data: {
                url: partial.SOURCE_MALOJA_URL,
                apiKey: partial.SOURCE_MALOJA_API_KEY
            }
    })
};

export const malojaSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    /**
     * When used in `maloja.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').meta({
        description: "When used in `maloja.config` this tells multi-scrobbler whether to use this data to configure a source or client.",
        default: "source",
        examples: ["source"]
    }),
    data: malojaSourceDataSchema,
});

export type MalojaSourceConfig = z.infer<typeof malojaSourceConfigSchema>;

export const malojaSourceAIOConfigSchema = z.object({
    ...malojaSourceConfigSchema.shape,
    type: z.literal('maloja'),
}).meta({title: 'Maloja'});

export type MalojaSourceAIOConfig = z.infer<typeof malojaSourceAIOConfigSchema>;
