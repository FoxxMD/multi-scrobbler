import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema, type EnvClientSchema} from "./index.ts";
import { httpUrl } from "../../../../utils/ZodUtils.ts";

export const listenBrainzDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    /**
     * URL for the ListenBrainz server, if not using the default
     *
     * @examples ["https://api.listenbrainz.org/"]
     * @default "https://api.listenbrainz.org/"
     * */
    url: httpUrl.optional().meta({
        description: "URL for the ListenBrainz server, if not using the default",
        default: "https://api.listenbrainz.org/",
        examples: ["https://api.listenbrainz.org/"]
    }),
    /**
     * User token for the user to scrobble for
     *
     * @examples ["6794186bf-1157-4de6-80e5-uvb411f3ea2b"]
     * */
    token: z.string().meta({
        description: "User token for the user to scrobble for",
        examples: ["6794186bf-1157-4de6-80e5-uvb411f3ea2b"]
    }),

    /**
     * Username of the user to scrobble for
     * */
    username: z.string().meta({
        description: "Username of the user to scrobble for"
    }),
});

export type ListenBrainzData = z.infer<typeof listenBrainzDataSchema>;

const envDataSchema = z.object({
    LZ_URL: listenBrainzDataSchema.shape.url,
    LZ_TOKEN: listenBrainzDataSchema.shape.token,
    LZ_USER: listenBrainzDataSchema.shape.username,
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, ListenBrainzClientConfig> = {
    env: envDataSchema,
    prefix: 'LZ',
    toConfig: (partial) => ({
            configureAs: 'client',
            data: {
                url: partial.LZ_URL,
                token: partial.LZ_TOKEN,
                username: partial.LZ_USER
            }
    })
};

export const listenBrainzClientDataSchema = listenBrainzDataSchema.extend(commonClientDataSchema.shape);

export type ListenBrainzClientData = z.infer<typeof listenBrainzClientDataSchema>;

export const listenBrainzClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using Listenbrainz as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Listenbrainz as a client",
        default: "client",
        examples: ["client"]
    }),
    data: listenBrainzClientDataSchema,
});

export type ListenBrainzClientConfig = z.infer<typeof listenBrainzClientConfigSchema>;

export const listenBrainzClientAIOConfigSchema = z.object({
    ...listenBrainzClientConfigSchema.shape,
    type: z.literal('listenbrainz'),
}).meta({title: "Listenbrainz"});

export type ListenBrainzClientAIOConfig = z.infer<typeof listenBrainzClientAIOConfigSchema>;

/** https://github.com/metabrainz/listenbrainz-server/pull/2572
 * https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/webserver/views/api_tools.py#L48
 */
export const MAX_ITEMS_PER_GET_LZ = 1000;
export const DEFAULT_ITEMS_PER_GET_LZ = 25;
export const DEFAULT_MS_ITEMS_PER_GET_LZ = 100;
