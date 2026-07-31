import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";
import { SimpleError } from "../../../errors/MSErrors.ts";

export const appleMusicKeySchema = z.object({
    id: z.string(),
    teamId: z.string(),
    p8: z.string()
});
const envKeyKeys = ['APPLEMUSIC_KEY_ID','APPLEMUSIC_KEY_P8','APPLEMUSIC_TEAM_ID'];

export type AppleMusicKey = z.infer<typeof appleMusicKeySchema>;

export const appleMusicDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    key: appleMusicKeySchema.optional(),
    token: z.string().optional(),
    mediaUserToken: z.string(),
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

export const appleMusicOptions = z.object({
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
});

export type AppleMusicOptions = z.infer<typeof appleMusicOptions>;

export const appleMusicSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: appleMusicDataSchema.optional(),
    options: z.object({
        ...commonSourceOptionsSchema.shape,
        ...appleMusicOptions.shape
    }).optional(),
});

export type AppleMusicSourceConfig = z.infer<typeof appleMusicSourceConfigSchema>;

const envDataSchema = z.object({
    APPLEMUSIC_KEY_ID: appleMusicKeySchema.shape.id.optional(),
    APPLEMUSIC_TEAM_ID: appleMusicKeySchema.shape.teamId.optional(),
    APPLEMUSIC_KEY_P8: appleMusicKeySchema.shape.p8.optional(),
    APPLEMUSIC_MEDIA_USER_TOKEN: appleMusicDataSchema.shape.mediaUserToken,
    APPLEMUSIC_TOKEN: appleMusicDataSchema.shape.token,
    APPLEMUSIC_ORIGIN_HEADER: appleMusicDataSchema.shape.origin,
    APPLEMUSIC_RECOVER_UNCHANGED_TOP_HISTORY: z.stringbool().optional().meta(appleMusicOptions.shape.recoverUnchangedTopHistory.meta()),
    APPLEMUSIC_NORMALIZE_ALBUM: z.stringbool().optional().meta(appleMusicOptions.shape.normalizeAlbum.meta())
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, AppleMusicSourceConfig> = {
    env: envDataSchema,
    toConfig: (partial) => {
        let appleMusicKey: AppleMusicKey | undefined;
        let token: string | undefined;
        let origin: string | undefined;
        if(envKeyKeys.some(x => partial[x] !== undefined)) {
            for(const k of envKeyKeys) {
                if(partial[k] === undefined) {
                    throw new SimpleError(`ENV ${partial[k]} is not defined but when providing auth via MusicKit Key you must provide all of these: ${envKeyKeys.join(', ')}`);
                }
                appleMusicKey = {
                    id: partial.APPLEMUSIC_KEY_ID,
                    teamId: partial.APPLEMUSIC_TEAM_ID,
                    p8: partial.APPLEMUSIC_KEY_P8
                };
            }
        } else {
            token = partial.APPLEMUSIC_TOKEN;
            if(token === undefined) {
                throw new SimpleError('If not providing auth via MusicKit then you must provide a browser token with ENV APPLEMUSIC_TOKEN, but none was defined.');
            }
            origin = partial.APPLEMUSIC_ORIGIN_HEADER;
            if(token === undefined) {
                throw new SimpleError('If not providing auth via MusicKit then you must provide an origin header with ENV APPLEMUSIC_ORIGIN_HEADER, but none was defined.');
            }
        }

        return {
            data: {
                key: appleMusicKey,
                token,
                origin,
                mediaUserToken: partial.APPLEMUSIC_MEDIA_USER_TOKEN
            },
            options: {
                recoverUnchangedTopHistory: partial.APPLEMUSIC_RECOVER_UNCHANGED_TOP_HISTORY,
                normalizeAlbum: partial.APPLEMUSIC_NORMALIZE_ALBUM
            }
        }
    }
};

export const appleMusicSourceAIOConfigSchema = z.object({
    ...appleMusicSourceConfigSchema.shape,
    type: z.literal('applemusic'),
}).meta({title: 'Apple Music'});

export type AppleMusicSourceAIOConfig = z.infer<typeof appleMusicSourceAIOConfigSchema>;
