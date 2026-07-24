import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const innertubeOptionsSchema = z.object({
    /**
     * Proof of Origin token
     *
     * May be required if YTM starts returning 403
     *
     * @see https://github.com/yt-dlp/yt-dlp/wiki/Extractors#po-token-guide
     */
    po_token: z.string().optional().meta({
        description: "Proof of Origin token"
    }),

    /**
     * Visitor ID value found in VISITOR_INFO1_LIVE or visitorData cookie
     *
     * May be required if YTM starts returning 403
     *
     * @see https://github.com/yt-dlp/yt-dlp/wiki/Extractors#po-token-guide
     */
    visitor_data: z.string().optional().meta({
        description: "Visitor ID value found in VISITOR_INFO1_LIVE or visitorData cookie"
    }),

    /**
     * If account login results in being able to choose multiple account, use a zero-based index to choose which one to monitor
     *
     * @examples [0,1]
     */
    account_index: z.number().optional().meta({
        description: "If account login results in being able to choose multiple account, use a zero-based index to choose which one to monitor",
        examples: [0, 1]
    }),

    location: z.string().optional(),
    lang: z.string().optional(),
    generate_session_locally: z.boolean().optional(),
    device_category: z.string().optional(),
    client_type: z.string().optional(),
    timezone: z.string().optional(),
});

export type InnertubeOptions = z.infer<typeof innertubeOptionsSchema>;

export const ytMusicDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * The cookie retrieved from the Request Headers of music.youtube.com after logging in.
     *
     * See https://ytmusicapi.readthedocs.io/en/stable/setup/browser.html#copy-authentication-headers for how to retrieve this value.
     *
     * @examples ["VISITOR_INFO1_LIVE=jMp2xA1Xz2_PbVc; __Secure-3PAPISID=3AxsXpy0M/AkISpjek; ..."]
     * */
    cookie: z.string().optional().meta({
        description: "The cookie retrieved from the Request Headers of music.youtube.com after logging in.",
        examples: ["VISITOR_INFO1_LIVE=jMp2xA1Xz2_PbVc; __Secure-3PAPISID=3AxsXpy0M/AkISpjek; ..."]
    }),

    /**
     * Google Cloud Console project OAuth Client ID
     *
     * Generated from a custom OAuth Client, see docs
     */
    clientId: z.string().optional().meta({
        description: "Google Cloud Console project OAuth Client ID"
    }),

    /**
     * Google Cloud Console project OAuth Client Secret
     *
     * Generated from a custom OAuth Client, see docs
     */
    clientSecret: z.string().optional().meta({
        description: "Google Cloud Console project OAuth Client Secret"
    }),

    /**
     * Google Cloud Console project OAuth Client Authorized redirect URI
     *
     * Generated from a custom OAuth Client, see docs. multi-scrobbler will generate a default based on BASE_URL.
     * Only specify this if the default does not work for you.
     */
    redirectUri: z.string().optional().meta({
        description: "Google Cloud Console project OAuth Client Authorized redirect URI"
    }),

    /**
     * Additional options for authorization and tailoring YTM client
     */
    innertubeOptions: innertubeOptionsSchema.optional().meta({
        description: "Additional options for authorization and tailoring YTM client"
    }),
});

export type YTMusicData = z.infer<typeof ytMusicDataSchema>;

export const ytMusicSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: ytMusicDataSchema.optional(),
    options: z.object({
        ...commonSourceOptionsSchema.shape,
        /**
         * When true MS will log to DEBUG all of the credentials data it receives from YTM
         * */
        logAuth: z.boolean().optional().meta({
            description: "When true MS will log to DEBUG all of the credentials data it receives from YTM"
        }),
        /**
         * Always log history diff
         *
         * By default MS will log to `WARN` if history diff is inconsistent but does not log if diff is expected (on new tracks found)
         * Set this to `true` to ALWAYS log diff on new tracks. Expected diffs will log to `DEBUG` and inconsistent diffs will continue to log to `WARN`
         *
         * @default false
         */
        logDiff: z.boolean().optional().meta({
            description: "Always log history diff",
            default: false
        }),
    }).optional(),
});

export type YTMusicSourceConfig = z.infer<typeof ytMusicSourceConfigSchema>;

export const ytMusicSourceAIOConfigSchema = z.object({
    ...ytMusicSourceConfigSchema.shape,
    type: z.literal('ytmusic'),
});

export type YTMusicSourceAIOConfig = z.infer<typeof ytMusicSourceAIOConfigSchema>;
