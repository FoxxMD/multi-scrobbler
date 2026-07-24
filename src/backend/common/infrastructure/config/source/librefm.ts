import * as z from "zod";
import {librefmDataSchema} from "../client/librefm.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const librefmSourceDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    ...librefmDataSchema.shape,
});

export type librefmSourceData = z.infer<typeof librefmSourceDataSchema>;

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
});

export type LibrefmSouceAIOConfig = z.infer<typeof librefmSouceAIOConfigSchema>;
