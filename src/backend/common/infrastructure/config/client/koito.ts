import * as z from "zod";
import type {UnixTimestamp} from "../../../../../core/Atomic.ts";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema} from "../common.ts";
import {commonClientConfigSchema, commonClientDataSchema} from "./index.ts";

export interface ListensResponse {
    items: ListenObjectResponse[]
    total_record_count: number
    items_per_page: number
    has_next_page: boolean
    current_page: number
}

export interface ListenObjectResponse {
    /** ISO8601 timestamp */
    time: string
    track: TrackResponse
}

export interface GetListensOptions {
    limit?: number
    page?: number
    week?: number
    month?: number
    year?: number

    // new in 0.1.0
    to?: UnixTimestamp
    from?: UnixTimestamp
}

export interface TrackResponse {
    id: number
    title: string
    artists: ArtistResponse[]
    musicbrainz_id: string | null
    listen_count: number
    duration: number
    image: string | null
    album_id: number
    time_listened: number
}

export interface ArtistResponse {
    id: number
    name: string
}

export const koitoDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    /**
     * URL for the Koito server
     *
     * @examples ["http://192.168.0.100:4110"]
     * */
    url: z.string().meta({
        description: "URL for the Koito server",
        examples: ["http://192.168.0.100:4110"]
    }),
    /**
     * User token for the user to scrobble for
     *
     * @examples ["pM195xPV98CDpk0QW47FIIOR8AKATAX5DblBF-Jq0t1MbbKL"]
     * */
    token: z.string().meta({
        description: "User token for the user to scrobble for",
        examples: ["pM195xPV98CDpk0QW47FIIOR8AKATAX5DblBF-Jq0t1MbbKL"]
    }),

    /**
     * Username of the user to scrobble for
     * */
    username: z.string().meta({
        description: "Username of the user to scrobble for"
    }),
});

export type KoitoData = z.infer<typeof koitoDataSchema>;

export const koitoClientDataSchema = koitoDataSchema.extend(commonClientDataSchema.shape);

export type KoitoClientData = z.infer<typeof koitoClientDataSchema>;

export const koitoClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using Koito as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Koito as a client",
        default: "client",
        examples: ["client"]
    }),
    data: koitoClientDataSchema,
});

export type KoitoClientConfig = z.infer<typeof koitoClientConfigSchema>;

export const koitoClientAIOConfigSchema = z.object({
    ...koitoClientConfigSchema.shape,
    type: z.literal('koito'),
});

export type KoitoClientAIOConfig = z.infer<typeof koitoClientAIOConfigSchema>;
