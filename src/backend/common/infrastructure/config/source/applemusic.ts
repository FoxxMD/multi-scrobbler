import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const appleMusicKeySchema = z.object({
    id: z.string(),
    teamId: z.string(),
    p8: z.string()
});

export type AppleMusicKey = z.infer<typeof appleMusicKeySchema>;

export const appleMusicDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    key: appleMusicKeySchema.optional(),
    token: z.string().optional(),
    mediaUserToken: z.string().optional(),
    /**
     * Origin header to include in every Apple Music API request.
     * Required when using a browser token (not a MusicKit key).
     *
     * @examples ["https://music.apple.com"]
     */
    origin: z.string().optional().meta({
        description: "Origin header to include in every Apple Music API request.",
        examples: ["https://music.apple.com"]
    }),
});

export type AppleMusicData = z.infer<typeof appleMusicDataSchema>;

export const appleMusicSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: appleMusicDataSchema.optional(),
    options: z.object({
        ...commonSourceOptionsSchema.shape,
        logAuth: z.boolean().optional(),
        logDiff: z.boolean().optional(),
        /**
         * Fixes a quirk where Apple Music's history API hides duplicate plays.
         * If you listen to A → B → A, the API returns [A, B, X, Y ...] instead of [A, B, A, X, Y ...].
         * This can cause MS to skip the second A play.
         *
         * When enabled (default), MS detects this pattern, keeps the interim tracks (B),
         * and re-scrobbles A as a re-listen. Disable only if you notice false positives.
         *
         * @default true
         * @examples [true, false]
         */
        recoverUnchangedTopHistory: z.boolean().optional().meta({
            description: "Fixes a quirk where Apple Music's history API hides duplicate plays.",
            default: true,
            examples: [true, false]
        }),
        /**
         * Removes extraneous suffixes from album data
         *
         * Apple Music add ' - EP' and ' - Single' to album names for EP's and singles, respectively.
         * These suffixes are not part of the official names for the album and can cause issues in scrobble services
         * or when matching metadata (musicbrainz).
         *
         * When this option is true (default), Multi-scrobbler automatically removes these suffixes.
         *
         * @default true
         * @examples [true, false]
         */
        normalizeAlbum: z.boolean().optional().meta({
            description: "Removes extraneous suffixes from album data",
            default: true,
            examples: [true, false]
        }),
    }).optional(),
});

export type AppleMusicSourceConfig = z.infer<typeof appleMusicSourceConfigSchema>;

export const appleMusicSourceAIOConfigSchema = z.object({
    ...appleMusicSourceConfigSchema.shape,
    type: z.literal('applemusic'),
}).meta({title: 'Apple Music'});

export type AppleMusicSourceAIOConfig = z.infer<typeof appleMusicSourceAIOConfigSchema>;
