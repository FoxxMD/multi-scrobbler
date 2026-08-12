import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";
import { httpUrl } from "../../../../utils/ZodUtils.ts";

export const kodiDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * URL of the Kodi HTTP server to connect to
     *
     * multi-scrobbler connects to the Web Service Interface endpoint that ultimately looks like this => `http://yourDomain:8080/jsonrpc`
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `http://`
     * * Hostname => `localhost`
     * * Port => `8080`
     * * Path => `/jsonrpc`
     *
     *
     * @examples ["http://localhost:8080/jsonrpc"]
     * @default "http://localhost:8080/jsonrpc"
     * */
    url: httpUrl.meta({
        description: "URL of the Kodi HTTP server to connect to",
        default: "http://localhost:8080/jsonrpc",
        examples: ["http://localhost:8080/jsonrpc"]
    }),

    /**
     * The username set for Remote Control via Web Sever
     * */
    username: z.string().meta({
        description: "The username set for Remote Control via Web Sever"
    }),

    /**
     * The password set for Remote Control via Web Sever
     * */
    password: z.string().meta({
        description: "The password set for Remote Control via Web Sever"
    }),
});

export type KodiData = z.infer<typeof kodiDataSchema>;

const envDataSchema = z.object({
    KODI_URL: kodiDataSchema.shape.url,
    KODI_USER: kodiDataSchema.shape.username,
    KODI_PASSWORD: kodiDataSchema.shape.password,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, KodiSourceConfig> = {
    env: envDataSchema,
    prefix: 'KODI',
    toConfig: (partial) => ({
            data: {
                url: partial.KODI_URL,
                username: partial.KODI_USER,
                password: partial.KODI_PASSWORD
            }
    })
};

export const kodiSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: kodiDataSchema,
});

export type KodiSourceConfig = z.infer<typeof kodiSourceConfigSchema>;

export const kodiSourceAIOConfigSchema = z.object({
    ...kodiSourceConfigSchema.shape,
    type: z.literal('kodi'),
}).meta({title: 'Kodi'});

export type KodiSourceAIOConfig = z.infer<typeof kodiSourceAIOConfigSchema>;
