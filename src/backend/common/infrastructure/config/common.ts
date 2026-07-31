import { stripIndents } from "common-tags";
import * as z from "zod";
import type { PlayTransformHooks, ExternalMetadataTerm } from "../../../../core/Transform.ts";
import type { CommonClientOptions } from "./client/index.ts";
import type { MarkRequired } from "ts-essentials";

export const commonConfigPrimitivesSchema = z.object({
    name: z.string().optional(),
    id: z.string().optional(),
    enable: z.boolean().optional()
});

export type CommonConfigPrimitives = MarkRequired<z.infer<typeof commonConfigPrimitivesSchema>, 'id'>;

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
        description: "A UNIQUE identifier for this Source/Client",
        examples: ["fooGlobalA"]
    }),
    data: commonDataSchema.optional(),
    /**
     * Should MS parse this config and create a client/source from it?
     *
     * @default true
     * @examples [true]
     * */
    enable: z.boolean().optional().meta({
        description: "Should MS parse this config and create a client/source from it?",
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
        description: stripIndents`default # of http **request** retries a source/client can make before error is thrown
        a test`,
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
}).meta({title: 'RequestRetryOptions'});

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

export const monitorOptionsSchema = z.object({
    /**
     * Set the default behavior for wether this component should automatically monitor any activity, or scrobble, it encounters
     * 
     * @default true
     */
    autoMonitor: z.boolean().optional().meta({
        default: true,
        description: 'Set the default behavior for wether this component should automatically monitor any activity, or scrobble, it encounters'
    })
})
export type MonitorOptions = z.infer<typeof monitorOptionsSchema>;

export const transformPresetEnv = <T extends CommonClientOptions = CommonClientOptions>(prefix: string, existing: T = undefined): undefined | T => {

    const env = process.env[`${prefix}_TRANSFORMS`];
    if (env === undefined || env.trim() === '') {
        return existing;
    }

    const popts: PlayTransformHooks<ExternalMetadataTerm> = {
        preCompare: []
    };
    for (const p of env.split(',').map(x => x.trim().toLocaleLowerCase())) {
        switch (p) {
            case 'native':
                popts.preCompare.push({ type: 'native' });
                break;
            case 'musicbrainz':
                popts.preCompare.push({ type: 'musicbrainz' });
                break;
        }
    }

    // @ts-expect-error T is fine
    return {
        ...(existing || {}),
        playTransform: popts
    };
};


type CommonComponentEnvShape<T extends string> = {
    [K in `${T}_ID`]: z.ZodString
} & {
    [K in `${T}_NAME`]: z.ZodOptional<z.ZodString>
} & {
    [K in `${T}_ENABLE`]: z.ZodOptional<ReturnType<typeof z.stringbool>>
};

export const generateCommonComponentEnvConfigSchema = <T extends string>(prefix: T) =>
    z.object({
        [`${prefix}_ID`]: z.string().meta({description: 'A globally unique ID'}),
        [`${prefix}_NAME`]: z.string().optional().meta({description: 'A vanity name', default: `Value of \`${prefix}_ID\``}),
        [`${prefix}_ENABLE`]: z.stringbool().optional()
    } as CommonComponentEnvShape<T>);

type CommonComponentEnvConfigParsed<T extends string> = {
    [K in `${T}_ID`]: string
} & {
    [K in `${T}_NAME`]?: string
} & {
    [K in `${T}_ENABLE`]?: boolean
};

export const commonComponentEnvConfigToConfigPrimitives = <T extends string>(prefix: T, envConfig: CommonComponentEnvConfigParsed<T>): CommonConfigPrimitives  => {
    const raw = envConfig as Record<string, string | boolean | undefined>;
    return {
        id: raw[`${prefix}_ID`] as string,
        name: raw[`${prefix}_NAME`] as string | undefined,
        enable: raw[`${prefix}_ENABLE`] as boolean | undefined
    };
};