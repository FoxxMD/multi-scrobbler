import * as z from "zod";
import {lastfmDataSchema} from "../client/lastfm.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const lastFmSourceDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    ...lastfmDataSchema.shape,
});

export type LastFmSourceData = z.infer<typeof lastFmSourceDataSchema>;

export const lastfmSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
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
    data: lastFmSourceDataSchema,
});

export type LastfmSourceConfig = z.infer<typeof lastfmSourceConfigSchema>;

export const lastFmSouceAIOConfigSchema = z.object({
    ...lastfmSourceConfigSchema.shape,
    type: z.literal('lastfm'),
});

export type LastFmSouceAIOConfig = z.infer<typeof lastFmSouceAIOConfigSchema>;
