import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";
import { envMetaNormalize } from "../../../../utils/ZodUtils.ts";

export const listenbrainzEndpointDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * The URL ending that should be used to identify scrobbles for this source
     *
     * If you are using multiple Listenbrainz endpoint sources (scrobbles for many users) you can use a slug to match Sources with individual users/origins
     *
     * Example:
     *
     * * slug: 'usera' => API URL: http://localhost:9078/api/listenbrainz/usera
     * * slug: 'originb' => API URL: http://localhost:9078/api/listenbrainz/originb
     *
     * If no slug is found from an extension's incoming webhook event the first Listenbrainz source without a slug will be used
     * */
    slug: z.string().optional().meta({
        description: "When using **multiple sources without tokens**, or **not** using a standard base URL, this is the URL base path that should be used to identify scrobbles for this source"
    }),

    /**
     * If an LZ submission request contains this token in the Authorization Header it will be used to match the submission with this Source
     *
     * See: https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#add-the-user-token-to-your-requests
     * */
    token: z.string().optional().meta({
        description: "If an LZ submission request contains this token in the Authorization Header it will be used to match the submission with this Source"
    }),

    /**
     * The listenbrainz "username" to associate with this Source
     *
     * Will be returned in validate-token responses and used to determine a response for playing-now, if your client supports it
     *
     * If no value is configured then the Source's name will be used
     */
    username: z.string().optional().meta({
        description: "The listenbrainz \"username\" to associate with this Source"
    }),
});

export const listenbrainzEndpointOptionsSchema = z.object({
    extractArtists: z.boolean().optional().default(true).meta({
        description: 'Tries to extract and match artists from listen data. Set to `false` to use listen data as-is (will likely lose fidelity!)'
    }),
    ...commonSourceOptionsSchema.shape,
});

export const listenbrainzEndpointSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: listenbrainzEndpointDataSchema.optional(),
    options: listenbrainzEndpointOptionsSchema.optional()
});


export type ListenbrainzEndpointData = z.infer<typeof listenbrainzEndpointDataSchema>;

const envDataSchema = z.object({
    LZE_SLUG: listenbrainzEndpointDataSchema.shape.slug,
    LZE_TOKEN: listenbrainzEndpointDataSchema.shape.token,
    LZE_USERNAME: listenbrainzEndpointDataSchema.shape.username,
    LZE_EXTRACT_ARTISTS: z.stringbool().optional().default(true).meta(envMetaNormalize(listenbrainzEndpointOptionsSchema.shape.extractArtists.meta()))
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, ListenbrainzEndpointSourceConfig> = {
    env: envDataSchema,
    prefix: 'LZE',
    toConfig: (partial) => ({
            data: {
                slug: partial.LZE_SLUG,
                token: partial.LZE_TOKEN,
                username: partial.LZE_USERNAME
            },
            options: {
                extractArtists: partial.LZE_EXTRACT_ARTISTS
            }
    })
};

export type ListenbrainzEndpointSourceConfig = z.infer<typeof listenbrainzEndpointSourceConfigSchema>;

export const listenbrainzEndpointSourceAIOConfigSchema = z.object({
    ...listenbrainzEndpointSourceConfigSchema.shape,
    type: z.literal('endpointlz'),
}).meta({title: 'Endpoint Listenbrainz'});

export type ListenbrainzEndpointSourceAIOConfig = z.infer<typeof listenbrainzEndpointSourceAIOConfigSchema>;
