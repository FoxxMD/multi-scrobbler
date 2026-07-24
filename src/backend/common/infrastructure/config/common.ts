import * as z from "zod";

export const commonConfigPrimitivesSchema = z.object({
    name: z.string().optional(),
    id: z.string().optional(),
    enable: z.boolean().optional()
});

export type CommonConfigPrimitives = z.infer<typeof commonConfigPrimitivesSchema>;

export const commonDataSchema = z.record(z.string(), z.any()); // keyOmit<{ [key: string]: any }, "options">

export type CommonData = z.infer<typeof commonDataSchema>;

export const commonConfigSchema = z.object({
    name: z.string().optional(),
    /** A UNIQUE identifier for this Source/Client
     *
     * It should be unique for the given Source/Client type. No other Source/Client of the same type should have this ID. This ID will be used to register this Source/Client in the database so that it can be identified even if you change the name of the component.
     *
     * If no id is given the name of this component will be used.
     */
    id: z.string().optional().meta({
        description: "A UNIQUE identifier for this Source/Client"
    }),
    data: commonDataSchema.optional(),
    /**
     * Should MS use this client/source? Defaults to true
     *
     * @default true
     * @examples [true]
     * */
    enable: z.boolean().optional().meta({
        description: "Should MS use this client/source?",
        default: true,
        examples: [true]
    })
});

export type CommonConfig = z.infer<typeof commonConfigSchema>;

export const requestRetryOptionsSchema = z.object({
    /**
     * default # of http request retries a source/client can make before error is thrown
     *
     * @default 1
     * @examples [1]
     * */
    maxRequestRetries: z.number().optional().meta({
        description: "default # of http request retries a source/client can make before error is thrown",
        default: 1,
        examples: [1]
    }),
    /**
     * default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying)
     *
     * @default 1.5
     * @examples [1.5]
     * */
    retryMultiplier: z.number().optional().meta({
        description: "default retry delay multiplier (retry attempt * multiplier = # of seconds to wait before retrying)",
        default: 1.5,
        examples: [1.5]
    })
});

export type RequestRetryOptions = z.infer<typeof requestRetryOptionsSchema>;

export const pollingOptionsSchema = z.object({

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

    /**
     * Number of seconds after which A Player is considered Stale
     *
     * When Polling the source does not recieve data about a specific Player after X seconds it becomes Stale. When the Player becomes Stale:
     *
     * * The current listening session is ended. If the Player becomes active again a new listening session is started (Player will miss `interval` seconds of listening)
     * * If the player has an existing session w/ track then MS attempts to scrobble it
     *
     * This option DOES NOT need to be set. It is automatically calculated as (`interval` * 3) when not defined.
     */
    staleAfter: z.number().optional().meta({
        description: "Number of seconds after which A Player is considered Stale"
    }),

    /**
     * Number of seconds after which A Player is considered Orphaned
     *
     * When Polling the source does not recieve data about a specific Player after X seconds it becomes Orphaned. When the Player becomes Orphaned:
     *
     * * The current Player session is ended and the Player is removed from MS
     * * MS attempts to scrobble, if the Player has an existing session w/ track
     *
     * A Player should become Orphaned EQUAL TO OR AFTER it becomes Stale.
     *
     * * This option DOES NOT need to be set. It is automatically calculated as (`interval` * 5) when not defined.
     * * If it is set it must be equal to or larger than `staleAfter` or (`interval * 3`)
     */
    orphanedAfter: z.number().optional().meta({
        description: "Number of seconds after which A Player is considered Orphaned"
    })
});

export type PollingOptions = z.infer<typeof pollingOptionsSchema>;
