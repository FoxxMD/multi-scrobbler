import * as z from "zod";
import {lastfmDataSchema} from "../client/lastfm.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const lastFmSourceDataSchema = z.object({
    ...lastfmDataSchema.shape,
    ...pollingOptionsSchema.shape,
    ...commonSourceDataSchema.shape,
});

export type LastFmSourceData = z.infer<typeof lastFmSourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_LASTFM_API_KEY: lastFmSourceDataSchema.shape.apiKey,
    SOURCE_LASTFM_SECRET: lastFmSourceDataSchema.shape.secret,
    SOURCE_LASTFM_REDIRECT_URI: lastFmSourceDataSchema.shape.redirectUri,
    SOURCE_LASTFM_SESSION: lastFmSourceDataSchema.shape.session,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, LastfmSourceConfig> = {
    env: envDataSchema,
    prefix: 'SOURCE_LASTFM',
    toConfig: (partial) => ({
            configureAs: 'source',
            data: {
                apiKey: partial.SOURCE_LASTFM_API_KEY,
                secret: partial.SOURCE_LASTFM_SECRET,
                redirectUri: partial.SOURCE_LASTFM_REDIRECT_URI,
                session: partial.SOURCE_LASTFM_SESSION
            }
    })
};

const {enable, clients, options, ...commonConfigPrimary} = commonSourceConfigSchema.shape;

export const lastfmSourceConfigSchema = z.object({
    ...commonConfigPrimary,
    data: lastFmSourceDataSchema,
    /**
     * When used in `lastfm.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').meta({
        description: "When used in `lastfm.config` this tells multi-scrobbler whether to use this data to configure a source or client.",
        default: "source",
        examples: ["source"]
    }),
    enable,
    clients,
    options,
});

export type LastfmSourceConfig = z.infer<typeof lastfmSourceConfigSchema>;

export const lastFmSouceAIOConfigSchema = z.object({
    type: z.literal('lastfm'),
    ...lastfmSourceConfigSchema.shape,
    // can be optional since it always appears in a source array
    configureAs: lastfmSourceConfigSchema.shape.configureAs.optional(),
}).meta({title: "Last.fm"});

export type LastFmSouceAIOConfig = z.infer<typeof lastFmSouceAIOConfigSchema>;
