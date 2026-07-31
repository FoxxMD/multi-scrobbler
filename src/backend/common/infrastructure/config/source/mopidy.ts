import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";
import { transformSplitMaybeString } from "../../../../utils/ZodUtils.ts";

export const mopidyDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * URL of the Mopidy HTTP server to connect to
     *
     * You MUST have Mopidy-HTTP extension enabled: https://mopidy.com/ext/http
     *
     * multi-scrobbler connects to the WebSocket endpoint that ultimately looks like this => `ws://localhost:6680/mopidy/ws/`
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `ws://`
     * * Hostname => `localhost`
     * * Port => `6680`
     * * Path => `/mopidy/ws/`
     *
     *
     * @examples ["ws://localhost:6680/mopidy/ws/"]
     * @default "ws://localhost:6680/mopidy/ws/"
     * */
    url: z.string().optional().meta({
        description: "URL of the Mopidy HTTP server to connect to",
        default: "ws://localhost:6680/mopidy/ws/",
        examples: ["ws://localhost:6680/mopidy/ws/"]
    }),

    /**
     * Do not scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive
     *
     * EX: Don't scrobble tracks from soundcloud by adding 'soundcloud' to this list.
     *
     * List is ignored if uriWhitelist is used.
     * */
    uriBlacklist: z.array(z.string()).optional().meta({
        description: "Do not scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive"
    }),

    /**
     * Only scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive
     *
     * EX: Only scrobble tracks from soundcloud by adding 'soundcloud' to this list.
     *
     * */
    uriWhitelist: z.array(z.string()).optional().meta({
        description: "Only scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive"
    }),

    /**
     * Remove album data that matches any case-insensitive string from this list when scrobbling,
     *
     * For certain sources (Soundcloud) Mopidy does not have all track info (Album) and will instead use "Soundcloud" as the Album name. You can prevent multi-scrobbler from using this bad Album data by adding the fake name to this list. Multi-scrobbler will still scrobble the track, just without the bad data.
     *
     * @examples [["Soundcloud", "Mixcloud"]]
     * @default ["Soundcloud"]
     * */
    albumBlacklist: z.array(z.string()).optional().meta({
        description: "Remove album data that matches any case-insensitive string from this list when scrobbling,",
        default: ["Soundcloud"],
        examples: [["Soundcloud", "Mixcloud"]]
    }),

    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * @default 10
     * @examples [10]
     * */
    interval: z.number().optional().meta({
        description: "How long to wait before polling the source API for new tracks (in seconds)",
        default: 10,
        examples: [10]
    }),

    /**
     * When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)
     *
     * @default 30
     * @examples [30]
     * */
    maxInterval: z.number().optional().meta({
        description: "When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)",
        default: 30,
        examples: [30]
    }),
});

export type MopidyData = z.infer<typeof mopidyDataSchema>;

export const mopidySourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: mopidyDataSchema,
});

export type MopidySourceConfig = z.infer<typeof mopidySourceConfigSchema>;

const envDataSchema = z.object({
    MOPIDY_URL: mopidyDataSchema.shape.url,
    MOPIDY_URI_DENYLIST: z.string().optional().pipe(transformSplitMaybeString).meta(mopidyDataSchema.shape.uriBlacklist.meta()),
    MOPIDY_URI_ALLOWLIST: z.string().optional().pipe(transformSplitMaybeString).meta(mopidyDataSchema.shape.uriWhitelist.meta()),
    MOPIDY_ALBUM_DENYLIST: z.string().optional().pipe(transformSplitMaybeString).meta(mopidyDataSchema.shape.albumBlacklist.meta()),
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, MopidySourceConfig> = {
    env: envDataSchema,
    prefix: 'MOPIDY',
    toConfig: (partial) => ({
        data: {
            url: partial.MOPIDY_URL,
            uriBlacklist: partial.MOPIDY_URI_DENYLIST,
            uriWhitelist: partial.MOPIDY_URI_ALLOWLIST,
            albumBlacklist: partial.MOPIDY_ALBUM_DENYLIST
        }
    })
};

export const mopidySourceAIOConfigSchema = z.object({
    ...mopidySourceConfigSchema.shape,
    type: z.literal('mopidy'),
}).meta({title: 'Mopidy'});

export type MopidySourceAIOConfig = z.infer<typeof mopidySourceAIOConfigSchema>;
