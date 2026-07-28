import * as z from "zod";
import {malojaDataSchema} from "../client/maloja.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const malojaSourceDataSchema = z.object({
    ...malojaDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
});

export type MalojaSourceData = z.infer<typeof malojaSourceDataSchema>;

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
