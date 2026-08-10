import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

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

export type ListenbrainzEndpointData = z.infer<typeof listenbrainzEndpointDataSchema>;

const envDataSchema = z.object({
    LZE_SLUG: listenbrainzEndpointDataSchema.shape.slug,
    LZE_TOKEN: listenbrainzEndpointDataSchema.shape.token,
    LZE_USERNAME: listenbrainzEndpointDataSchema.shape.username,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, ListenbrainzEndpointSourceConfig> = {
    env: envDataSchema,
    prefix: 'LZE',
    toConfig: (partial) => ({
            data: {
                slug: partial.LZE_SLUG,
                token: partial.LZE_TOKEN,
                username: partial.LZE_USERNAME
            }
    })
};

export const listenbrainzEndpointSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: listenbrainzEndpointDataSchema.optional(),
});

export type ListenbrainzEndpointSourceConfig = z.infer<typeof listenbrainzEndpointSourceConfigSchema>;

export const listenbrainzEndpointSourceAIOConfigSchema = z.object({
    ...listenbrainzEndpointSourceConfigSchema.shape,
    type: z.literal('endpointlz'),
}).meta({title: 'Endpoint Listenbrainz'});

export type ListenbrainzEndpointSourceAIOConfig = z.infer<typeof listenbrainzEndpointSourceAIOConfigSchema>;
