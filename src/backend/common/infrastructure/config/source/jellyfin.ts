import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const jellyApiDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * HOST:PORT of the Jellyfin server to connect to
     * */
    url: z.string().meta({
        description: "HOST:PORT of the Jellyfin server to connect to"
    }),
    /**
     * The username of the user to authenticate for or track scrobbles for
     * */
    user: z.string().meta({
        description: "The username of the user to authenticate for or track scrobbles for"
    }),
    /**
     * Password of the username to authenticate for
     *
     * Required if `apiKey` is not provided.
     * */
    password: z.string().optional().meta({
        description: "Password of the username to authenticate for"
    }),
    /**
     * API Key to authenticate with.
     *
     * Required if `password` is not provided.
     * */
    apiKey: z.string().optional().meta({
        description: "API Key to authenticate with."
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

    /**
     * Allow MS to scrobble audio media in libraries classified other than 'music'
     *
     * `librariesAllow` will achieve the same result as this but this is more convenient if you do not want to explicitly list every library name or are only using `librariesBlock`
     */
    additionalAllowedLibraryTypes: z.array(z.string()).optional().meta({
        description: "Allow MS to scrobble audio media in libraries classified other than 'music'"
    }),

    /**
    * Force media with a type of "Unknown" to be counted as Audio
    *
    * @default false
    * @deprecated use allowMediaTypes instead
    */
    allowUnknown: z.boolean().optional().meta({
        description: "Force media with a type of \"Unknown\" to be counted as Audio",
        default: false
    }),

    /**
    * Allow these media types to be scrobbled.
    *
    * If not defined or empty, uses 'Audio' as default. If non-empty then *only* uses these types (make sure you include Audio!)
    *
    * Values are case-insensitive.
    *
    * See https://github.com/jellyfin/jellyfin-sdk-typescript/blob/master/src/generated-client/models/media-type.ts#L22 for possible types
    *
    */
    allowMediaTypes: z.union([z.array(z.string()), z.string()]).optional().meta({
        description: "Allow these media types to be scrobbled."
    }),

    /**
     * HOST:PORT of the Jellyfin server that your browser will be able to access from the frontend (and thus load images and links from)
     * If unspecified it will use the normal server HOST and PORT from the `url`
     * Necessary if you are using a reverse proxy or other network configuration that prevents the frontend from accessing the server directly
     *
     * ENV: JELLYFIN_FRONTEND_URL_OVERRIDE
     * */
    frontendUrlOverride: z.string().optional().meta({
        description: "HOST:PORT of the Jellyfin server that your browser will be able to access from the frontend (and thus load images and links from)"
    }),
});

export type JellyApiData = z.infer<typeof jellyApiDataSchema>;

export const jellyApiOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
});

export type JellyApiOptions = z.infer<typeof jellyApiOptionsSchema>;

export const jellyApiSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: jellyApiDataSchema,
    options: jellyApiOptionsSchema.optional(),
});

export type JellyApiSourceConfig = z.infer<typeof jellyApiSourceConfigSchema>;

export const jellyApiSourceAIOConfigSchema = z.object({
    ...jellyApiSourceConfigSchema.shape,
    type: z.literal('jellyfin'),
}).meta({title: 'Jellyfin'});

export type JellyApiSourceAIOConfig = z.infer<typeof jellyApiSourceAIOConfigSchema>;
