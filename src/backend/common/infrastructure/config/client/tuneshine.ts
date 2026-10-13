import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, nowPlayingOptionsSchema, type EnvClientSchema} from "./index.ts";
import { httpUrl } from "../../../../utils/ZodUtils.ts";

export const tuneshineDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    /**
     * IP or hostname for the Tuneshine device
     *
     * @examples ["192.168.1.100"]
     * */
    host: httpUrl.meta({
        description: "IP or http(s)://hostname for the Tuneshine device",
        examples: ["http://192.168.1.100"]
    }),
});
export type TuneshineData = z.infer<typeof tuneshineDataSchema>;

export const tuneshineOptionsSchema = z.object({
    ...commonClientOptionsSchema.shape,
    ...nowPlayingOptionsSchema.shape,
});

const envDataSchema = z.object({
    TUNE_HOST: tuneshineDataSchema.shape.host,
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, TuneshineClientConfig> = {
    env: envDataSchema,
    prefix: 'TUNE',
    toConfig: (partial) => ({
            configureAs: 'client',
            data: {
                host: partial.TUNE_HOST,
            }
    })
};

export const tuneshineClientDataSchema = tuneshineDataSchema.extend(commonClientDataSchema.shape);

export type TuneshineClientData = z.infer<typeof tuneshineClientDataSchema>;

export const tuneshineClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using Tuneshine as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Tuneshine as a client",
        default: "client",
        examples: ["client"]
    }),
    data: tuneshineClientDataSchema,
    options: tuneshineOptionsSchema.optional()
});

export type TuneshineClientConfig = z.infer<typeof tuneshineClientConfigSchema>;

export const tuneshineClientAIOConfigSchema = z.object({
    ...tuneshineClientConfigSchema.shape,
    type: z.literal('tuneshine'),
}).meta({title: "Tuneshine"});

export type TuneshineClientAIOConfig = z.infer<typeof tuneshineClientAIOConfigSchema>;
