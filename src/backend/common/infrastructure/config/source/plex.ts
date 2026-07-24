import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const plexApiDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    token: z.string().optional(),
    /**
     * http(s)://HOST:PORT of the Plex server to connect to
     * */
    url: z.string().meta({
        description: "http(s)://HOST:PORT of the Plex server to connect to"
    }),

    /**
     * Only scrobble for specific users (case-insensitive)
     *
     * If `true` MS will scrobble activity from all users
     * */
    usersAllow: z.union([z.string(), z.literal(true), z.array(z.string())]).optional().meta({
        description: "Only scrobble for specific users (case-insensitive)"
    }),
    /**
     * Do not scrobble for these users (case-insensitive)
     * */
    usersBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble for these users (case-insensitive)"
    }),

    /**
     * Only scrobble if device or application name contains strings from this list (case-insensitive)
     * */
    devicesAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if device or application name contains strings from this list (case-insensitive)"
    }),
    /**
     * Do not scrobble if device or application name contains strings from this list (case-insensitive)
     * */
    devicesBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if device or application name contains strings from this list (case-insensitive)"
    }),

    /**
     * Only scrobble if library name contains string from this list (case-insensitive)
     * */
    librariesAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if library name contains string from this list (case-insensitive)"
    }),
    /**
     * Do not scrobble if library name contains strings from this list (case-insensitive)
     * */
    librariesBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if library name contains strings from this list (case-insensitive)"
    }),
});

export type PlexApiData = z.infer<typeof plexApiDataSchema>;

export const plexApiOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    /**
     * Ignore invalid cert errors when connecting to Plex
     *
     * Useful for Plex servers using "Required" Secure Connections with self-signed certificates
     *
     * Do not enable unless you know you need this.
     *
     * @default false
     */
    ignoreInvalidCert: z.boolean().optional().meta({
        description: "Ignore invalid cert errors when connecting to Plex",
        default: false
    }),
});

export type PlexApiOptions = z.infer<typeof plexApiOptionsSchema>;

export const plexApiSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: plexApiDataSchema,
    options: plexApiOptionsSchema.optional(),
});

export type PlexApiSourceConfig = z.infer<typeof plexApiSourceConfigSchema>;

export const plexApiSourceAIOConfigSchema = z.object({
    ...plexApiSourceConfigSchema.shape,
    type: z.literal('plex'),
});

export type PlexApiSourceAIOConfig = z.infer<typeof plexApiSourceAIOConfigSchema>;
