import * as z from "zod";
import {tealClientOptionsSchema, tealDataSchema} from "../client/tealfm.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const tealSourceDataSchema = z.object({
    ...tealDataSchema.shape,
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    serviceAllow: z.array(z.string()).optional(),
    serviceDeny: z.array(z.string()).optional(),
});

export type TealSourceData = z.infer<typeof tealSourceDataSchema>;

export const tealSourceOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    ...tealClientOptionsSchema.shape,
});

export type TealSourceOptions = z.infer<typeof tealSourceOptionsSchema>;

export const tealSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    /**
     * Should always be `souce` when using Tealfm as a Source
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: z.literal('source').meta({
        description: "Should always be `souce` when using Tealfm as a Source",
        default: "source",
        examples: ["source"]
    }),
    data: tealSourceDataSchema,
    options: tealSourceOptionsSchema.optional(),
});

export type TealSourceConfig = z.infer<typeof tealSourceConfigSchema>;

export const tealSourceAIOConfigSchema = z.object({
    ...tealSourceConfigSchema.shape,
    type: z.literal('tealfm'),
});

export type TealSourceAIOConfig = z.infer<typeof tealSourceAIOConfigSchema>;
