import * as z from "zod";
import {pollingOptionsSchema, requestRetryOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";
import { httpUrl } from "../../../../utils/ZodUtils.ts";

export const jRiverDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    ...requestRetryOptionsSchema.shape,
    /**
     * URL of the JRiver HTTP server to connect to
     *
     * multi-scrobbler connects to the Web Service Interface endpoint that ultimately looks like this => `http://yourDomain:52199/MCWS/v1/`
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `http://`
     * * Hostname => `localhost`
     * * Port => `52199`
     * * Path => `/MCWS/v1/`
     *
     *
     * @examples ["http://localhost:52199/MCWS/v1/"]
     * @default "http://localhost:52199/MCWS/v1/"
     * */
    url: z.union([
        httpUrl,
        z.ipv4()
        ]).meta({
        description: "URL of the JRiver HTTP server to connect to",
        default: "http://localhost:52199/MCWS/v1/",
        examples: ["http://localhost:52199/MCWS/v1/"]
    }),

    /**
     * If you have enabled authentication, the username you set
     * */
    username: z.string().optional().meta({
        description: "If you have enabled authentication, the username you set"
    }),

    /**
     * If you have enabled authentication, the password you set
     * */
    password: z.string().optional().meta({
        description: "If you have enabled authentication, the password you set"
    }),
});

export type JRiverData = z.infer<typeof jRiverDataSchema>;

const envDataSchema = z.object({
    JRIVER_URL: jRiverDataSchema.shape.url,
    JRIVER_USER: jRiverDataSchema.shape.username,
    JRIVER_PASSWORD: jRiverDataSchema.shape.password,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, JRiverSourceConfig> = {
    env: envDataSchema,
    prefix: 'JRIVER',
    toConfig: (partial) => ({
            data: {
                url: partial.JRIVER_URL,
                username: partial.JRIVER_USER,
                password: partial.JRIVER_PASSWORD
            }
    })
};

export const jRiverSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: jRiverDataSchema,
});

export type JRiverSourceConfig = z.infer<typeof jRiverSourceConfigSchema>;

export const jRiverSourceAIOConfigSchema = z.object({
    ...jRiverSourceConfigSchema.shape,
    type: z.literal('jriver'),
}).meta({title: 'JRiver'});

export type JRiverSourceAIOConfig = z.infer<typeof jRiverSourceAIOConfigSchema>;
