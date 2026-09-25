import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";
import { envMetaNormalize, transformSplitMaybeString, transformSplitMaybeStringOrBoolean } from "../../../../utils/ZodUtils.ts";

//export const jellyfinMediaTypesSchema = z.enum(['unknown','video','audio','photo','book','musicvideo']);
//export type JellyfinMediaType = z.infer<typeof jellyfinMediaTypesSchema>;
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
     * Only scrobble for specific users
     *
     * If `true` MS will scrobble activity from all users
     * */
    usersAllow: z.union([z.string(), z.literal(true), z.array(z.string())]).optional().meta({
        description: "Only scrobble for specific users from this list. If `true`, scrobble for all users."
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
        description: "Allow media types from this list to be scrobbled"
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

const envDataSchema = z.object({
    JELLYFIN_USER: jellyApiDataSchema.shape.user,
    JELLYFIN_PASSWORD: jellyApiDataSchema.shape.password,
    JELLYFIN_APIKEY: jellyApiDataSchema.shape.apiKey,
    JELLYFIN_URL: jellyApiDataSchema.shape.url,
    JELLYFIN_USERS_ALLOW: z.union([z.string(),z.literal(true)]).optional().pipe(transformSplitMaybeStringOrBoolean).meta(envMetaNormalize(jellyApiDataSchema.shape.usersAllow.meta())),
    JELLYFIN_USERS_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(jellyApiDataSchema.shape.usersBlock.meta())),
    JELLYFIN_DEVICES_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(jellyApiDataSchema.shape.devicesAllow.meta())),
    JELLYFIN_DEVICES_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(jellyApiDataSchema.shape.devicesBlock.meta())),
    JELLYFIN_LIBRARIES_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(jellyApiDataSchema.shape.librariesAllow.meta())),
    JELLYFIN_LIBRARIES_BLOCK: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(jellyApiDataSchema.shape.librariesBlock.meta())),
    JELLYFIN_FRONTEND_URL_OVERRIDE: jellyApiDataSchema.shape.frontendUrlOverride,
    JELLYFIN_MEDIATYPES_ALLOW: z.string().optional().pipe(transformSplitMaybeString).meta(envMetaNormalize(jellyApiDataSchema.shape.allowMediaTypes.meta())),
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, JellyApiSourceConfig> = {
    env: envDataSchema,
    prefix: 'JELLYFIN',
    toConfig: (partial) => ({
            data: {
                user: partial.JELLYFIN_USER,
                password: partial.JELLYFIN_PASSWORD,
                apiKey: partial.JELLYFIN_APIKEY,
                url: partial.JELLYFIN_URL,
                usersAllow: partial.JELLYFIN_USERS_ALLOW as undefined | string[] | true,
                usersBlock: partial.JELLYFIN_USERS_BLOCK,
                devicesAllow: partial.JELLYFIN_DEVICES_ALLOW,
                devicesBlock: partial.JELLYFIN_DEVICES_BLOCK,
                librariesAllow: partial.JELLYFIN_LIBRARIES_ALLOW,
                librariesBlock: partial.JELLYFIN_LIBRARIES_BLOCK,
                frontendUrlOverride: partial.JELLYFIN_FRONTEND_URL_OVERRIDE,
                allowMediaTypes: partial.JELLYFIN_MEDIATYPES_ALLOW
            }
    })
};

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
