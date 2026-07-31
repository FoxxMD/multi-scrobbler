import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema, type EnvSchemas} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema} from "./index.ts";

export const malojaDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    /**
     * URL for maloja server
     *
     * @examples ["http://localhost:42010"]
     * */
    url: z.string().meta({
        description: "URL for maloja server",
        examples: ["http://localhost:42010"]
    }),
    /**
     * API Key for Maloja server
     *
     * @examples ["myApiKey"]
     * */
    apiKey: z.string().meta({
        description: "API Key for Maloja server",
        examples: ["myApiKey"]
    }),
});

export type MalojaData = z.infer<typeof malojaDataSchema>;

export const malojaClientDataSchema = malojaDataSchema.extend(commonClientDataSchema.shape);

export type MalojaClientData = z.infer<typeof malojaClientDataSchema>;

const envDataSchema = z.object({
    MALOJA_URL: z.string().meta({description: 'Base URL of your installation'}),
    MALOJA_API_KEY: z.string().default('fsdfsd')
});

export const envSchemas: EnvSchemas = {
    data: envDataSchema
};

export const malojaClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using Maloja as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Maloja as a client",
        default: "client",
        examples: ["client"]
    }),
    data: malojaClientDataSchema,
});

export type MalojaClientConfig = z.infer<typeof malojaClientConfigSchema>;

export const malojaClientAIOConfigSchema = z.object({
    ...malojaClientConfigSchema.shape,
    type: z.literal('maloja'),
}).meta({title: 'Maloja'});

export type MalojaClientAIOConfig = z.infer<typeof malojaClientAIOConfigSchema>;