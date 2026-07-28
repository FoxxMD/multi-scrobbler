import * as z from "zod";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, nowPlayingOptionsSchema} from "./index.ts";

export const lastfmDataSchema = z.object({
    ...commonClientDataSchema.shape,
    ...requestRetryOptionsSchema.shape,
    /**
     * API Key generated from Last.fm/Libre.fm account
     *
     * @examples ["787c921a2a2ab42320831aba0c8f2fc2"]
     * */
    apiKey: z.string().meta({
        description: "API Key generated from Last.fm/Libre.fm account",
        examples: ["787c921a2a2ab42320831aba0c8f2fc2"]
    }),
    /**
     * Secret generated from Last.fm/Libre.fm account
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    secret: z.string().meta({
        description: "Secret generated from Last.fm/Libre.fm account",
        examples: ["ec42e09d5ae0ee0f0816ca151008412a"]
    }),
    /**
     * Optional session id returned from a completed auth flow
     * */
    session: z.string().optional().meta({
        description: "Optional session id returned from a completed auth flow"
    }),
    /**
     * Optional URI to use for callback. Specify this if callback should be different than the default. MUST have "lastfm/callback" in the URL somewhere.
     *
     * @default "http://localhost:9078/lastfm/callback"
     * @examples ["http://localhost:9078/lastfm/callback"]
     * */
    redirectUri: z.string().optional().meta({
        description: "Optional URI to use for callback.",
        default: "http://localhost:9078/lastfm/callback",
        examples: ["http://localhost:9078/lastfm/callback"]
    }),
});

export type LastfmData = z.infer<typeof lastfmDataSchema>;

export const lastfmClientOptionsSchema = z.object({
    ...commonClientOptionsSchema.shape,
    ...nowPlayingOptionsSchema.shape,
});

export type LastfmClientOptions = z.infer<typeof lastfmClientOptionsSchema>;

export const lastfmClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using LastFM as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: z.union([z.literal('client'), z.literal('source')]).optional().meta({
        description: "Should always be `client` when using LastFM as a client",
        default: "client",
        examples: ["client"]
    }),
    data: lastfmDataSchema,
    options: lastfmClientOptionsSchema.optional(),
});

export type LastfmClientConfig = z.infer<typeof lastfmClientConfigSchema>;

export const lastfmClientAIOConfigSchema = z.object({
    ...lastfmClientConfigSchema.shape,
    type: z.literal('lastfm'),
}).meta({title: 'Last.fm'});

export type LastfmClientAIOConfig = z.infer<typeof lastfmClientAIOConfigSchema>;
