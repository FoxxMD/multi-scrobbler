import * as z from "zod";
import {malojaDataSchema} from "../client/maloja.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const malojaSourceDataSchema = z.object({
    ...malojaDataSchema.shape,
    ...pollingOptionsSchema.shape,
    ...commonSourceDataSchema.shape,
});

export type MalojaSourceData = z.infer<typeof malojaSourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_MALOJA_URL: malojaSourceDataSchema.shape.url,
    SOURCE_MALOJA_API_KEY: malojaSourceDataSchema.shape.apiKey,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, MalojaSourceConfig> = {
    env: envDataSchema,
    prefix: 'SOURCE_MALOJA',
    toConfig: (partial) => ({
            configureAs: 'source',
            data: {
                url: partial.SOURCE_MALOJA_URL,
                apiKey: partial.SOURCE_MALOJA_API_KEY
            }
    })
};

const {enable, clients, options, ...commonConfigPrimary} = commonSourceConfigSchema.shape;

export const malojaSourceConfigSchema = z.object({
    ...commonConfigPrimary,
    data: malojaSourceDataSchema,
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
    enable,
    clients,
    options,
});

export type MalojaSourceConfig = z.infer<typeof malojaSourceConfigSchema>;

export const malojaSourceAIOConfigSchema = z.object({
    type: z.literal('maloja'),
    ...malojaSourceConfigSchema.shape,
    // can be optional since it always appears in a source array
    configureAs: malojaSourceConfigSchema.shape.configureAs.optional(),
}).meta({title: 'Maloja'});

export type MalojaSourceAIOConfig = z.infer<typeof malojaSourceAIOConfigSchema>;
