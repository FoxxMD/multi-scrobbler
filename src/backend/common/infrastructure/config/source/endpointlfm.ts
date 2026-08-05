import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";

export const lastFmEndpointDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * The URL ending that should be used to identify scrobbles for this source
     *
     * If you are using multiple Last.fm endpoint sources (scrobbles for many users) you can use a slug to match Sources with individual users/origins
     *
     * Example:
     *
     * * slug: 'usera' => API URL: http://localhost:9078/api/lastfm/usera
     * * slug: 'originb' => API URL: http://localhost:9078/api/lastfm/originb
     *
     * If no slug is found from an extension's incoming webhook event the first Last.fm source without a slug will be used
     * */
    slug: z.string().optional().meta({
        description: "The URL ending that should be used to identify scrobbles for this source"
    }),
    username: z.string().optional().meta({
        description: 'A fake username to differentiate LFM Endpoint Sources'
    }),
    apiKey: z.string().optional().meta({
        description: 'A fake api key to differentiate LFM Endpoint Sources'
    }),
});

export type LastFMEndpointData = z.infer<typeof lastFmEndpointDataSchema>;

const envDataSchema = z.object({
    LFM_SLUG: lastFmEndpointDataSchema.shape.slug,
    LFM_USERNAME: lastFmEndpointDataSchema.shape.username,
    LFM_API_KEY: lastFmEndpointDataSchema.shape.apiKey
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, LastFMEndpointSourceConfig> = {
    env: envDataSchema,
    prefix: 'LFM',
    toConfig: (partial) => ({
            data: {
                slug: partial.LFM_SLUG,
                username: partial.LFM_USERNAME,
                apiKey: partial.LFM_API_KEY
            }
    })
};

export const lastFmEndpointSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: lastFmEndpointDataSchema.optional(),
});

export type LastFMEndpointSourceConfig = z.infer<typeof lastFmEndpointSourceConfigSchema>;

export const lastFmEndpointSourceAIOConfigSchema = z.object({
    ...lastFmEndpointSourceConfigSchema.shape,
    type: z.literal('endpointlfm'),
}).meta({title: 'Endpoint Last.fm'});

export type LastFMEndpointSourceAIOConfig = z.infer<typeof lastFmEndpointSourceAIOConfigSchema>;
