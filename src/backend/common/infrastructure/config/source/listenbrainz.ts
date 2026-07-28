import * as z from "zod";
import {listenBrainzDataSchema} from "../client/listenbrainz.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const listenBrainzSourceDataSchema = z.object({
    ...listenBrainzDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type ListenBrainzSourceData = z.infer<typeof listenBrainzSourceDataSchema>;

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
