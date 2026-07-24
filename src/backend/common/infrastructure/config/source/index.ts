import * as z from "zod";
import {requestRetryOptionsSchema, commonConfigSchema} from "../common.ts";
import {retentionConfigDurationValueSchema} from "../database.ts";
import {playTransformOptionsSchema} from "../../../../../core/Transform.ts";

export const sourceRetryOptionsSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    /**
     * default # of automatic polling restarts on error
     *
     * @default 5
     * @examples [5]
     * */
    maxPollRetries: z.number().optional().meta({
        description: "default # of automatic polling restarts on error",
        default: 5,
        examples: [5]
    }),
});

export type SourceRetryOptions = z.infer<typeof sourceRetryOptionsSchema>;

export const scrobbleThresholdsSchema = z.object({
    /**
     * The number of seconds a track has been listened to before it should be considered scrobbled.
     *
     * Set to null to disable.
     *
     * @see https://www.last.fm/api/scrobbling (When is a scrobble a scrobble?)
     * @seehttps://github.com/krateng/maloja/blob/master/API.md#scrobbling-guideline
     *
     * @default 240
     * @examples [240]
     * */
    duration: z.union([z.number(), z.null()]).optional().meta({
        description: "The number of seconds a track has been listened to before it should be considered scrobbled.",
        default: 240,
        examples: [240]
    }),
    /**
     * The percentage (as an integer) of a track that should have been seen played before it should be scrobbled. Only used if the Source provides information about how long the track is.
     *
     * Set to null to disable.
     *
     * NOTE: This should be used with care when the Source is a "polling" type (has an 'interval' property). If the track is short and the interval is too high MS may ignore the track if percentage is high because it had not "seen" the track for long enough from first discovery, even if you have been playing the track for longer.
     *
     * @see https://www.last.fm/api/scrobbling (When is a scrobble a scrobble?)
     * @see https://github.com/krateng/maloja/blob/master/API.md#scrobbling-guideline
     *
     * @default 50
     * @examples [50]
     * */
    percent: z.union([z.number(), z.null()]).optional().meta({
        description: "The percentage (as an integer) of a track that should have been seen played before it should be scrobbled.",
        default: 50,
        examples: [50]
    }),
});

export type ScrobbleThresholds = z.infer<typeof scrobbleThresholdsSchema>;

// `LogLevel` (from `@foxxmd/logging`) is a simple string-literal union, reconstructed directly.
const logLevelSchema = z.enum(["silent", "fatal", "error", "warn", "info", "log", "verbose", "debug", "trace"]);

// `FileLogOptions` (from `@foxxmd/logging`) extends `FileOptions`, which itself extends `PinoRollOptions` and
// `RollOptions` - two levels deep, but all plain data fields, so it's reconstructed in full here rather than
// stubbed.
const fileLogOptionsSchema = z.object({
    size: z.union([z.number(), z.string()]).optional(),
    frequency: z.union([z.literal('daily'), z.literal('hourly'), z.number()]).optional(),
    timestamp: z.union([z.literal('unix'), z.literal('iso'), z.literal('auto')]).optional(),
    path: z.union([z.string(), z.custom<() => string>((val) => typeof val === 'function')]).optional(),
    level: z.union([logLevelSchema, z.literal(false)]).optional(),
});

export const commonSourceOptionsSchema = z.object({
    ...sourceRetryOptionsSchema.shape,
    /**
     * * If this source has INGRESS to MS (sends a payload, rather than MS GETTING requesting a payload) then setting this option to true will make MS log the payload JSON to DEBUG output
     * * If this source is POLLING then it will log the raw data for each unique track/response the first time it is seen
     *
     * @default false
     * @examples [false]
     * */
    logPayload: z.boolean().optional().meta({
        description: "If this source has INGRESS to MS (sends a payload, rather than MS GETTING requesting a payload) then setting this option to true will make MS log the payload JSON to DEBUG output",
        default: false,
        examples: [false]
    }),

    /**
     * If this source has INGRESS to MS and has filters this determines how MS logs when a payload (event) fails a defined filter (IE users/servers/library filters)
     *
     * * `false` => do not log
     * * `debug` => log to DEBUG level
     * * `warn` => log to WARN level (default)
     *
     * Hint: This is useful if you are sure this source is setup correctly and you have multiple other sources. Set to `debug` or `false` to reduce log noise.
     *
     * @default warn
     * @examples ["warn"]
     * */
    logFilterFailure: z.union([z.literal(false), z.literal('debug'), z.literal('warn')]).optional().meta({
        description: "If this source has INGRESS to MS and has filters this determines how MS logs when a payload (event) fails a defined filter (IE users/servers/library filters)",
        default: "warn",
        examples: ["warn"]
    }),

    /**
     * For Sources that track Player State (currently playing) this logs a simple player state/summary to DEBUG output
     *
     * @default false
     * @examples [false]
     * */
    logPlayerState: z.boolean().optional().meta({
        description: "For Sources that track Player State (currently playing) this logs a simple player state/summary to DEBUG output",
        default: false,
        examples: [false]
    }),

    /**
     * **Exprimental:** Log to a separate file for this Source.
     *
     * Useful for debugging long-running Sources
     */
    logToFile: z.union([z.literal(true), logLevelSchema, fileLogOptionsSchema]).optional().meta({
        description: "**Exprimental:** Log to a separate file for this Source."
    }),

    /**
     * If this source
     *
     * * supports fetching a listen history
     * * and this option is enabled
     *
     * then on startup MS will attempt to scrobble the recent listens from that history
     *
     * @default true
     * @examples [true, false]
     * */
    scrobbleBacklog: z.boolean().optional().meta({
        description: "If this source",
        default: true,
        examples: [true, false]
    }),

    /**
     * Set thresholds for when multi-scrobbler should consider a tracked play to be "scrobbable". If both duration and percent are defined then if either condition is met the track is scrobbled.
     * */
    scrobbleThresholds: scrobbleThresholdsSchema.optional().meta({
        description: "Set thresholds for when multi-scrobbler should consider a tracked play to be \"scrobbable\"."
    }),

    /**
     * The number of listens to fetch when scrobbling from backlog
     *
     * * Only applies if this source supports fetching a listen history
     * * If not specified it defaults to the maximum number of listens the source API supports
     * */
    scrobbleBacklogCount: z.number().optional().meta({
        description: "The number of listens to fetch when scrobbling from backlog"
    }),

    playTransform: playTransformOptionsSchema.optional(),

    retention: retentionConfigDurationValueSchema.optional(),
});

export type CommonSourceOptions = z.infer<typeof commonSourceOptionsSchema>;

export const manualListeningOptionsSchema = z.object({
    /**
     * For Sources that support manual listening, should MS default to scrobbling when no user interaction has occurred?
     *
     * If not specified MS will use a Source's specific behavior, see Source's documentation.
     */
    systemScrobble: z.boolean().optional().meta({
        description: "For Sources that support manual listening, should MS default to scrobbling when no user interaction has occurred?"
    }),
});

export type ManualListeningOptions = z.infer<typeof manualListeningOptionsSchema>;

export const commonSourceDataSchema = z.looseObject({});

// `z.infer` of an empty object schema (strict or loose) picks up a `never`/`unknown` index signature that a
// plain empty TS interface never had, which breaks the many `interface FooData extends CommonSourceData, ...`
// declarations elsewhere (some in the "extends" direction, some in the "assign a plain object" direction).
// The original `interface CommonSourceData {}` is structurally identical to `{}` itself, so the type is
// declared directly rather than derived from the schema for this one empty-shape case.
export type CommonSourceData = {};

export const commonSourceConfigSchema = z.object({
    ...commonConfigSchema.shape,
    /**
     * Unique identifier for this source.
     * */
    name: z.string().optional().meta({
        description: "Unique identifier for this source."
    }),
    /**
     * Restrict scrobbling tracks played from this source to Clients with names from this list. If list is empty is not present Source scrobbles to all configured Clients.
     *
     * @examples [["MyMalojaConfigName","MyLastFMConfigName"]]
     * */
    clients: z.array(z.string()).optional().meta({
        description: "Restrict scrobbling tracks played from this source to Clients with names from this list.",
        examples: [["MyMalojaConfigName","MyLastFMConfigName"]]
    }),
    data: commonSourceDataSchema.optional(),
    options: commonSourceOptionsSchema.optional(),
});

// `data`'s type is overridden here for the same reason `CommonSourceData` is declared directly above rather
// than derived from `commonSourceDataSchema` - the schema-inferred type carries an index signature that the
// original empty `data?: CommonSourceData` field never had.
export type CommonSourceConfig = Omit<z.infer<typeof commonSourceConfigSchema>, 'data'> & { data?: CommonSourceData };
