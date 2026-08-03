import * as z from "zod";
import {librefmDataSchema} from "../client/librefm.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const librefmSourceDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    ...librefmDataSchema.shape,
});

export type librefmSourceData = z.infer<typeof librefmSourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_LIBREFM_API_KEY: librefmSourceDataSchema.shape.apiKey,
    SOURCE_LIBREFM_SECRET: librefmSourceDataSchema.shape.secret,
    SOURCE_LIBREFM_REDIRECT_URI: librefmSourceDataSchema.shape.redirectUri,
    SOURCE_LIBREFM_SESSION: librefmSourceDataSchema.shape.session,
    SOURCE_LIBREFM_URLBASE: librefmSourceDataSchema.shape.urlBase,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, LibrefmSourceConfig> = {
    env: envDataSchema,
    prefix: 'SOURCE_LIBREFM',
    toConfig: (partial) => ({
            data: {
                apiKey: partial.SOURCE_LIBREFM_API_KEY,
                secret: partial.SOURCE_LIBREFM_SECRET,
                redirectUri: partial.SOURCE_LIBREFM_REDIRECT_URI,
                session: partial.SOURCE_LIBREFM_SESSION,
                urlBase: partial.SOURCE_LIBREFM_URLBASE
            }
    })
};

export const librefmSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    /**
     * When used in `librefm.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').optional().meta({
        description: "When used in `librefm.config` this tells multi-scrobbler whether to use this data to configure a source or client.",
        default: "source",
        examples: ["source"]
    }),
    data: librefmDataSchema,
});

export type LibrefmSourceConfig = z.infer<typeof librefmSourceConfigSchema>;

export const librefmSouceAIOConfigSchema = z.object({
    ...librefmSourceConfigSchema.shape,
    type: z.literal('librefm'),
}).meta({title: "Libre.fm"});

export type LibrefmSouceAIOConfig = z.infer<typeof librefmSouceAIOConfigSchema>;
