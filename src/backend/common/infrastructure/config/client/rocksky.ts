import * as z from "zod";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, nowPlayingOptionsSchema, type EnvClientSchema} from "./index.ts";

export const rockSkyDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,

    /**
     * API Key generated from [API Applications](https://docs.rocksky.app/migrating-from-listenbrainz-to-rocksky-1040189m0) in Rocksky for your account
     *
     * @examples ["6794186bf-1157-4de6-80e5-uvb411f3ea2b"]
     * */
    key: z.string().optional().meta({
        description: "API Key generated from [API Applications](https://docs.rocksky.app/migrating-from-listenbrainz-to-rocksky-1040189m0) in Rocksky for your account",
        examples: ["6794186bf-1157-4de6-80e5-uvb411f3ea2b"]
    }),

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
        description: "The **fully-qualified** handle for your ATPRoto/Bluesky account, like:"
    }),
});

export type RockSkyData = z.infer<typeof rockSkyDataSchema>;

const envDataSchema = z.object({
    ROCKSKY_KEY: rockSkyDataSchema.shape.key,
    ROCKSKY_TOKEN: rockSkyDataSchema.shape.token,
    ROCKSKY_HANDLE: rockSkyDataSchema.shape.handle,
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, RockSkyClientConfig> = {
    env: envDataSchema,
    toConfig: (partial) => ({
            data: {
                key: partial.ROCKSKY_KEY,
                token: partial.ROCKSKY_TOKEN,
                handle: partial.ROCKSKY_HANDLE
            }
    })
};

export const rockSkyClientDataSchema = rockSkyDataSchema.extend(commonClientDataSchema.shape);

export type RockSkyClientData = z.infer<typeof rockSkyClientDataSchema>;

export const rockSkyOptionsSchema = z.object({
    /**
     * URL for the Rocksky *Listenbrainz* endpoint, if not using the default
     *
     * @examples ["https://audioscrobbler.rocksky.app"]
     * @default "https://audioscrobbler.rocksky.app"
     * */
    audioScrobblerUrl: z.string().optional().meta({
        description: "URL for the Rocksky *Listenbrainz* endpoint, if not using the default",
        default: "https://audioscrobbler.rocksky.app",
        examples: ["https://audioscrobbler.rocksky.app"]
    }),

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
