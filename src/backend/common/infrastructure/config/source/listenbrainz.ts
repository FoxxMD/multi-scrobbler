import * as z from "zod";
import {listenBrainzDataSchema} from "../client/listenbrainz.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const listenBrainzSourceDataSchema = z.object({
    ...listenBrainzDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type ListenBrainzSourceData = z.infer<typeof listenBrainzSourceDataSchema>;

const envDataSchema = z.object({
    SOURCE_LZ_URL: listenBrainzSourceDataSchema.shape.url,
    SOURCE_LZ_TOKEN: listenBrainzSourceDataSchema.shape.token,
    SOURCE_LZ_USER: listenBrainzSourceDataSchema.shape.username,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, ListenBrainzSourceConfig> = {
    env: envDataSchema,
    prefix: 'SOURCE_LZ',
    toConfig: (partial) => ({
            data: {
                url: partial.SOURCE_LZ_URL,
                token: partial.SOURCE_LZ_TOKEN,
                username: partial.SOURCE_LZ_USER
            }
    })
};

export const listenBrainzSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    /**
     * When used in `listenbrainz.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').meta({
        description: "When used in `listenbrainz.config` this tells multi-scrobbler whether to use this data to configure a source or client.",
        default: "source",
        examples: ["source"]
    }),
    data: listenBrainzSourceDataSchema,
});

export type ListenBrainzSourceConfig = z.infer<typeof listenBrainzSourceConfigSchema>;

export const listenBrainzSourceAIOConfigSchema = z.object({
    ...listenBrainzSourceConfigSchema.shape,
    type: z.literal('listenbrainz'),
}).meta({title: 'Listenbrainz'});

export type ListenBrainzSourceAIOConfig = z.infer<typeof listenBrainzSourceAIOConfigSchema>;
