import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";
import { envMetaNormalize, transformSplitMaybeString } from "../../../../utils/ZodUtils.ts";
import { commaSeparatedListReplace } from "../../../../utils/StringUtils.ts";

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
     * Only scrobble for specific users
     *
     * If `true` MS will scrobble activity from all users
     * */
    usersAllow: z.union([z.string(), z.literal(true), z.array(z.string())]).optional().meta({
        description: "Only scrobble for specific users from this list"
    }),
    /**
     * Do not scrobble for these users
     * */
    usersBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble for users from this list"
    }),

    /**
     * Only scrobble if device or application name contains strings from this list
     * */
    devicesAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if device or application name contains strings from this list"
    }),
    /**
     * Do not scrobble if device or application name contains strings from this list
     * */
    devicesBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if device or application name contains strings from this list"
    }),

    /**
     * Only scrobble if library name contains string from this list
     * */
    librariesAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble if library name contains string from this list"
    }),
    /**
     * Do not scrobble if library name contains strings from this list
     * */
    librariesBlock: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Do not scrobble if library name contains strings from this list"
    }),
});

export type PlexApiData = z.infer<typeof plexApiDataSchema>;

const envDataSchema = z.object({
    PLEX_URL: plexApiDataSchema.shape.url,
    PLEX_TOKEN: plexApiDataSchema.shape.token,
    PLEX_USERS_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(plexApiDataSchema.shape.usersAllow.meta())),
    PLEX_USERS_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(plexApiDataSchema.shape.usersBlock.meta())),
    PLEX_DEVICES_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(plexApiDataSchema.shape.devicesBlock.meta())),
    PLEX_DEVICES_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(plexApiDataSchema.shape.devicesAllow.meta())),
    PLEX_LIBRARIES_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(plexApiDataSchema.shape.librariesAllow.meta())),
    PLEX_LIBRARIES_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(plexApiDataSchema.shape.librariesBlock.meta())),
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, PlexApiSourceConfig> = {
    env: envDataSchema,
    pipe: 'in',
    prefix: 'PLEX',
    toConfig: (partial) => ({
            data: {
                url: partial.PLEX_URL,
                token: partial.PLEX_TOKEN,
                usersAllow: partial.PLEX_USERS_ALLOW,
                usersBlock: partial.PLEX_USERS_BLOCK,
                devicesAllow: partial.PLEX_DEVICES_ALLOW,
                devicesBlock: partial.PLEX_DEVICES_BLOCK,
                librariesAllow: partial.PLEX_LIBRARIES_ALLOW,
                librariesBlock: partial.PLEX_LIBRARIES_BLOCK
            }
    })
};

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
}).meta({title: 'Plex'});

export type PlexApiSourceAIOConfig = z.infer<typeof plexApiSourceAIOConfigSchema>;
