import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema} from "./index.ts";

export const listenBrainzDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    /**
     * URL for the ListenBrainz server, if not using the default
     *
     * @examples ["https://api.listenbrainz.org/"]
     * @default "https://api.listenbrainz.org/"
     * */
    url: z.string().optional().meta({
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
});

export type ListenBrainzClientAIOConfig = z.infer<typeof listenBrainzClientAIOConfigSchema>;

/** https://github.com/metabrainz/listenbrainz-server/pull/2572
 * https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/webserver/views/api_tools.py#L48
 */
export const MAX_ITEMS_PER_GET_LZ = 1000;
export const DEFAULT_ITEMS_PER_GET_LZ = 25;
export const DEFAULT_MS_ITEMS_PER_GET_LZ = 100;
