import * as z from "zod";
import {playTransformOptionsSchema} from "../../../../../core/Transform.ts";
import {commonConfigSchema, requestRetryOptionsSchema} from "../common.ts";
import {retentionConfigDurationValueSchema} from "../database.ts";

/**
 * Scrobble matching (between new source track and existing client scrobbles) logging options. Used for debugging.
 * */
export const matchLoggingOptionsSchema = z.object({
    /**
     * Log to DEBUG when a new track does NOT match an existing scrobble
     *
     * @default false
     * @examples [false]
     * */
    onNoMatch: z.boolean().optional().meta({
        description: "Log to DEBUG when a new track does NOT match an existing scrobble",
        default: false,
        examples: [false]
    }),
    /**
     * Log to DEBUG when a new track DOES match an existing scrobble
     *
     * @default false
     * @examples [false]
     * */
    onMatch: z.boolean().optional().meta({
        description: "Log to DEBUG when a new track DOES match an existing scrobble",
        default: false,
        examples: [false]
    }),
    /**
     * Include confidence breakdowns in track match logging, if applicable
     *
     * @default false
     * @examples [false]
     * */
    confidenceBreakdown: z.boolean().optional().meta({
        description: "Include confidence breakdowns in track match logging, if applicable",
        default: false,
        examples: [false]
    }),
});

export type MatchLoggingOptions = z.infer<typeof matchLoggingOptionsSchema>;

export const commonClientDataSchema = z.looseObject({});

// `z.infer` of an empty object schema (strict or loose) picks up a `never`/`unknown` index signature that a
// plain empty TS interface never had, which breaks the many `interface FooData extends CommonClientData, ...`
// declarations elsewhere (see the same fix applied to `CommonSourceData` in `../source/index.ts`). The
// original `interface CommonClientData {}` is structurally identical to `{}` itself, so the type is declared
// directly rather than derived from the schema for this one empty-shape case.
export type CommonClientData = {};

export const upstreamRefreshOptionsSchema = z.object({
    /**
     * Try to get fresh scrobble history from client when tracks to be scrobbled are newer than the last scrobble found in client history
     * @default true
     * @examples [true]
     * */
    refreshEnabled: z.boolean().optional().meta({
        description: "Try to get fresh scrobble history from client when tracks to be scrobbled are newer than the last scrobble found in client history",
        default: true,
        examples: [true]
    }),
    /**
     * Refresh scrobbled plays from upstream service if last refresh was at least X seconds ago
     *
     * **In most case this setting does NOT need to be changed.** The default value is sufficient for the majority of use-cases. Increasing this setting may increase upstream service load and slow down scrobbles.
     *
     * This setting should only be changed in specific scenarios where MS is handling multiple "relaying" client-services (IE lfm -> lz -> lfm) and there is the potential for a client to be out of sync after more than a few seconds.
     *
     * @examples [60]
     * @default 60
     * */
    refreshStaleAfter: z.number().optional().meta({
        description: "Refresh scrobbled plays from upstream service if last refresh was at least X seconds ago",
        default: 60,
        examples: [60]
    }),

    /**
     * Minimum time (milliseconds) required to pass before upstream scrobbles can be refreshed.
     *
     * **In most case this setting does NOT need to be changed.** This will always be equal to or smaller than `refreshStaleAfter`.
     *
     * @default 5000
     * @examples [5000]
     * */
    refreshMinInterval: z.number().optional().meta({
        description: "Minimum time (milliseconds) required to pass before upstream scrobbles can be refreshed.",
        default: 5000,
        examples: [5000]
    }),

    /**
     * The number of tracks to retrieve on initial refresh (related to scrobbleBacklogCount). If not specified this is the maximum supported by the client in 1 API call.
     * */
    refreshInitialCount: z.number().optional().meta({
        description: "The number of tracks to retrieve on initial refresh (related to scrobbleBacklogCount)."
    }),
});

export type UpstreamRefreshOptions = z.infer<typeof upstreamRefreshOptionsSchema>;

export const nowPlayingOptionsSchema = z.object({

    /**
     * Configure if this Client should report Now Playing from Sources that can scrobble to it
     *
     * * `true` (default) => Report Now Playing from any eligible Source.
     *   * If multiple Sources are Playing then reported Play is based on alphabetical order of Source names
     * * `false` => Do not report Now Playing
     * * `string` list => list of Source `names` that should be allowed to report Now Playing. Order of list determine priority of Play to Report.
     *
     * @default true
     * */
    nowPlaying: z.union([z.boolean(), z.array(z.string())]).optional().meta({
        description: "Configure if this Client should report Now Playing from Sources that can scrobble to it",
        default: true
    }),
});

export type NowPlayingOptions = z.infer<typeof nowPlayingOptionsSchema>;

export const commonClientOptionsSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    ...upstreamRefreshOptionsSchema.shape,

    /**
     * Check client for an existing scrobble at the same recorded time as the "new" track to be scrobbled. If an existing scrobble is found this track is not track scrobbled.
     * @default true
     * @examples [true]
     * */
    checkExistingScrobbles: z.boolean().optional().meta({
        description: "Check client for an existing scrobble at the same recorded time as the \"new\" track to be scrobbled.",
        default: true,
        examples: [true]
    }),
    /**
     * Options used for increasing verbosity of logging in MS (used for debugging)
     * */
    verbose: z.object({
        match: matchLoggingOptionsSchema.optional()
    }).optional().meta({
        description: "Options used for increasing verbosity of logging in MS (used for debugging)"
    }),
    /**
     * Number of times MS should automatically retry scrobbles in dead letter queue
     *
     * @default 3
     * @examples [3]
     * */
    deadLetterRetries: z.number().optional().meta({
        description: "Number of times MS should automatically retry scrobbles in dead letter queue",
        default: 3,
        examples: [3]
    }),

    playTransform: playTransformOptionsSchema.optional(),

    retention: retentionConfigDurationValueSchema.optional(),
});

export type CommonClientOptions = z.infer<typeof commonClientOptionsSchema>;

export const commonClientConfigSchema = z.object({
    ...commonConfigSchema.shape,
    /**
     * Unique identifier for this client. Used with sources to restrict where scrobbles are sent.
     *
     * @examples ["MyConfig"]
     * */
    name: z.string().meta({
        description: "Unique identifier for this client.",
        examples: ["MyConfig"]
    }),
    /**
     * Specific data required to configure this client
     * */
    data: commonClientDataSchema.optional().meta({
        description: "Specific data required to configure this client"
    }),
    options: commonClientOptionsSchema.optional(),
});

// `data`'s type is overridden here for the same reason `CommonClientData` is declared directly above rather
// than derived from `commonClientDataSchema`.
export type CommonClientConfig = Omit<z.infer<typeof commonClientConfigSchema>, 'data'> & { data?: CommonClientData };
