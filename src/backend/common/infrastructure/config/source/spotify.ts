import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const spotifySourceDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * spotify client id
     *
     * @examples ["787c921a2a2ab42320831aba0c8f2fc2"]
     * */
    clientId: z.string().meta({
        description: "spotify client id",
        examples: ["787c921a2a2ab42320831aba0c8f2fc2"]
    }),
    /**
     * spotify client secret
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    clientSecret: z.string().meta({
        description: "spotify client secret",
        examples: ["ec42e09d5ae0ee0f0816ca151008412a"]
    }),
    /**
     * spotify redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/callback"
     * @examples ["http://localhost:9078/callback"]
     * */
    redirectUri: z.string().optional().meta({
        description: "spotify redirect URI -- required only if not the default shown here.",
        default: "http://localhost:9078/callback",
        examples: ["http://localhost:9078/callback"]
    }),
    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * It is unlikely you should need to change this unless you scrobble many very short tracks often
     *
     * Reading:
     * * https://developer.spotify.com/documentation/web-api/guides/rate-limits/
     * * https://medium.com/mendix/limiting-your-amount-of-calls-in-mendix-most-of-the-time-rest-835dde55b10e
     *   * Rate limit may ~180 req/min
     * * https://community.spotify.com/t5/Spotify-for-Developers/Web-API-ratelimit/m-p/5503150/highlight/true#M7930
     *   * Informally indicated as 20 req/sec? Probably for burstiness
     *
     * @default 10
     * @examples [10]
     * */
    interval: z.number().optional().meta({
        description: "How long to wait before polling the source API for new tracks (in seconds)",
        default: 10,
        examples: [10]
    }),
});

export type SpotifySourceData = z.infer<typeof spotifySourceDataSchema>;

const envDataSchema = z.object({
    SPOTIFY_CLIENT_ID: spotifySourceDataSchema.shape.clientId,
    SPOTIFY_CLIENT_SECRET: spotifySourceDataSchema.shape.clientSecret,
    SPOTIFY_REDIRECT_URI: spotifySourceDataSchema.shape.redirectUri,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, SpotifySourceConfig> = {
    env: envDataSchema,
    toConfig: (partial) => ({
            data: {
                clientId: partial.SPOTIFY_CLIENT_ID,
                clientSecret: partial.SPOTIFY_CLIENT_SECRET,
                redirectUri: partial.SPOTIFY_REDIRECT_URI
            }
    })
};

export const spotifySourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: spotifySourceDataSchema,
});

export type SpotifySourceConfig = z.infer<typeof spotifySourceConfigSchema>;

export const spotifySourceAIOConfigSchema = z.object({
    ...spotifySourceConfigSchema.shape,
    type: z.literal('spotify'),
}).meta({title: 'Spotify'});

export type SpotifySourceAIOConfig = z.infer<typeof spotifySourceAIOConfigSchema>;
