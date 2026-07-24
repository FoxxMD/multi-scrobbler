import * as z from "zod";
import type {Second} from "../../../../../core/Atomic.ts";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const deezerDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * deezer client id
     *
     * @examples ["a89cba1569901a0671d5a9875fed4be1"]
     * */
    clientId: z.string().meta({
        description: "deezer client id",
        examples: ["a89cba1569901a0671d5a9875fed4be1"]
    }),
    /**
     * deezer client secret
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    clientSecret: z.string().meta({
        description: "deezer client secret",
        examples: ["ec42e09d5ae0ee0f0816ca151008412a"]
    }),
    /**
     * deezer redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/deezer/callback"
     * @examples ["http://localhost:9078/deezer/callback"]
     * */
    redirectUri: z.string().optional().meta({
        description: "deezer redirect URI -- required only if not the default shown here.",
        default: "http://localhost:9078/deezer/callback",
        examples: ["http://localhost:9078/deezer/callback"]
    }),

    accessToken: z.string().optional(),
});

export type DeezerData = z.infer<typeof deezerDataSchema>;

export const deezerSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: deezerDataSchema,
});

export type DeezerSourceConfig = z.infer<typeof deezerSourceConfigSchema>;

export const deezerSourceAIOConfigSchema = z.object({
    ...deezerSourceConfigSchema.shape,
    type: z.literal('deezer'),
});

export type DeezerSourceAIOConfig = z.infer<typeof deezerSourceAIOConfigSchema>;

export const deezerInternalDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /** ARL retrieved from Deezer response header */
    arl: z.string().meta({
        description: "ARL retrieved from Deezer response header"
    }),
    /** User agent
     *
     * @default "Mozilla/5.0 (X11; Linux i686; rv:135.0) Gecko/20100101 Firefox/135.0"
     */
    userAgent: z.string().optional().meta({
        description: "User agent",
        default: "Mozilla/5.0 (X11; Linux i686; rv:135.0) Gecko/20100101 Firefox/135.0"
    }),

    /** The ID (USER_ID) of the linked account to monitor. If not set, monitors the main ARL account */
    accountId: z.string().optional().meta({
        description: "The ID (USER_ID) of the linked account to monitor."
    }),
});

export type DeezerInternalData = z.infer<typeof deezerInternalDataSchema>;

export const deezerInternalSourceOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    fuzzyDiscoveryIgnore: z.union([z.boolean(), z.literal('aggressive')]).optional(),
});

export type DeezerInternalSourceOptions = z.infer<typeof deezerInternalSourceOptionsSchema>;

export const deezerInternalSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: deezerInternalDataSchema,
    options: deezerInternalSourceOptionsSchema.optional(),
});

export type DeezerInternalSourceConfig = z.infer<typeof deezerInternalSourceConfigSchema>;

export const deezerInternalAIOConfigSchema = z.object({
    ...deezerInternalSourceConfigSchema.shape,
    type: z.literal('deezer'),
});

export type DeezerInternalAIOConfig = z.infer<typeof deezerInternalAIOConfigSchema>;

export const deezerCompatConfigSchema = z.union([deezerSourceConfigSchema, deezerInternalSourceConfigSchema]);

export type DeezerCompatConfig = z.infer<typeof deezerCompatConfigSchema>;

export const deezerAIOCompatConfigSchema = z.union([deezerSourceAIOConfigSchema, deezerInternalAIOConfigSchema]);

export type DeezerAIOCompatConfig = z.infer<typeof deezerAIOCompatConfigSchema>;

export interface DeezerInternalTrackData {
    /** Song Id */
    SNG_ID: string
    /** Date listened as unix timestamp in seconds */
    TS: Second
    /** Album Id */
    ALB_ID: string
    /** Album Title */
    ALB_TITLE: string
    /** Album Art Id */
    ALB_PICTURE: string
    /** Artist Id */
    ART_ID: string
    /** Artist Name */
    ART_NAME: string
    /** Song Title */
    SNG_TITLE: string
    /** Time listened to track in seconds */
    DURATION: Second

    __TYPE__: 'song' | string
}
