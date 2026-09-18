import * as z from "zod";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, nowPlayingOptionsSchema, type EnvClientSchema} from "./index.ts";
import { atProtoAppDataSchema } from "./atproto.ts";

export const rockSkyDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,

    /**
     * Access Token generated from https://rocksky.app/access-tokens in Rocksky for your account
     *
     * @examples ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaWQ....."]
     * */
    token: z.string().optional().meta({
        description: "Access Token generated from https://rocksky.app/access-tokens in Rocksky for your account",
        examples: ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaWQ....."]
    }),

    /**
     * The **fully-qualified** handle for your ATPRoto/Bluesky account, like:
     *
     * * alice.bsky.social
     * * foxxmd.com
     * * mysuer.blacksky.app
     *
     * */
    handle: z.string().meta({
        description: "The **fully-qualified** handle, or identifier, for your Atmosphere account"
    }),

    appPassword: atProtoAppDataSchema.shape.appPassword.optional().meta(atProtoAppDataSchema.shape.appPassword.meta())
});

export type RockSkyData = z.infer<typeof rockSkyDataSchema>;

const envDataSchema = z.object({
    ROCKSKY_TOKEN: rockSkyDataSchema.shape.token,
    ROCKSKY_HANDLE: rockSkyDataSchema.shape.handle,
    ROCKSKY_APP_PW: rockSkyDataSchema.shape.appPassword
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, RockSkyClientConfig> = {
    env: envDataSchema,
    prefix: 'ROCKSKY',
    toConfig: (partial) => ({
            configureAs: 'client',
            data: {
                token: partial.ROCKSKY_TOKEN,
                handle: partial.ROCKSKY_HANDLE,
                appPassword: partial.ROCKSKY_APP_PW
            }
    })
};

export const rockSkyClientDataSchema = rockSkyDataSchema.extend(commonClientDataSchema.shape);

export type RockSkyClientData = z.infer<typeof rockSkyClientDataSchema>;

export const rockSkyOptionsSchema = z.object({
    /**
     * URL for the Rocksky *API* endpoint, if not using the default
     *
     * @examples ["https://api.rocksky.app"]
     * @default "https://api.rocksky.app"
     * */
    apiUrl: z.string().optional().meta({
        description: "URL for the Rocksky *API* endpoint, if not using the default",
        default: "https://api.rocksky.app",
        examples: ["https://api.rocksky.app"]
    }),
});

export type RockSkyOptions = z.infer<typeof rockSkyOptionsSchema>;

export const rockSkyClientOptionsSchema = z.object({
    ...rockSkyOptionsSchema.shape,
    ...commonClientOptionsSchema.shape,
    ...nowPlayingOptionsSchema.shape,
});

export type RockSkyClientOptions = z.infer<typeof rockSkyClientOptionsSchema>;

export const rockSkyClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using RockSky as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: z.union([z.literal('client'), z.literal('source')]).optional().meta({
        description: "Should always be `client` when using RockSky as a client",
        default: "client",
        examples: ["client"]
    }),
    data: rockSkyClientDataSchema,
    options: rockSkyClientOptionsSchema.optional(),
});

export type RockSkyClientConfig = z.infer<typeof rockSkyClientConfigSchema>;

export const rockSkyClientAIOConfigSchema = z.object({
    ...rockSkyClientConfigSchema.shape,
    type: z.literal('rocksky'),
}).meta({title: 'Rocksky'});

export type RockSkyClientAIOConfig = z.infer<typeof rockSkyClientAIOConfigSchema>;
