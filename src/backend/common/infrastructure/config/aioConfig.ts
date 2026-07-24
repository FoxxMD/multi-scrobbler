import * as z from "zod";
import {clientAIOConfigSchema} from "./client/clients.ts";
import {commonClientOptionsSchema} from "./client/index.ts";
import {requestRetryOptionsSchema} from "./common.ts";
import {webhookConfigSchema} from "./health/webhooks.ts";
import {commonSourceOptionsSchema, fileLogOptionsSchema, logLevelSchema, sourceRetryOptionsSchema} from "./source/index.ts";
import {sourceAIOConfigSchema} from "./source/sources.ts";
import {cacheConfigUserSchema} from "../Atomic.ts";
import {retentionConfigDurationValueSchema} from "./database.ts";

export const sourceDefaultsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
});

export type SourceDefaults = z.infer<typeof sourceDefaultsSchema>;

export const clientDefaultsSchema = z.object({
    ...commonClientOptionsSchema.shape,
});

export type ClientDefaults = z.infer<typeof clientDefaultsSchema>;

// `TransformOptions`/`TransformerCommonConfig<T,Y>` (from `../../../../core/Atomic.ts`) are only ever used at
// their default type params (`Record<string, any>`) everywhere in the codebase, but `TransformerCommonConfig`
// stays generic there and `TransformerCommon<T,Y> extends TransformerCommonConfig<T,Y>` - converting the
// exported interface itself would break that extends clause. Reconstructed locally here instead, scoped to
// this file's `transformers` field only.
const transformOptionsSchema = z.object({
    failOnFetch: z.boolean().optional(),
    throwOnFailure: z.union([
        z.boolean(),
        z.array(z.union([z.literal('artists'), z.literal('title'), z.literal('albumArtists'), z.literal('album'), z.literal('duration'), z.literal('meta'), z.literal('art')])),
    ]).optional(),
    ttl: z.string().optional(),
});

const transformerCommonConfigSchema = z.object({
    defaults: z.record(z.string(), z.any()).optional(),
    data: z.record(z.string(), z.any()).optional(),
    type: z.string(),
    name: z.string().optional(),
    options: transformOptionsSchema.optional(),
});

export const aioConfigSchema = z.object({
    sourceDefaults: sourceDefaultsSchema.optional(),
    clientDefaults: clientDefaultsSchema.optional(),
    sources: z.array(sourceAIOConfigSchema).optional(),
    clients: z.array(clientAIOConfigSchema).optional(),

    webhooks: z.array(webhookConfigSchema).optional(),

    /**
     * Set the port the multi-scrobbler UI will be served from
     *
     * @default 9078
     * @examples [9078]
     * */
    port: z.number().optional().meta({
        description: "Set the port the multi-scrobbler UI will be served from",
        default: 9078,
        examples: [9078]
    }),

    /**
     * Set the Base URL the application should assume the UI is served from.
     *
     * This will affect how default redirect URLs are generated (spotify, lastfm, deezer) and some logging messages.
     *
     * It will NOT set the actual interface/IP that the application is listening on.
     *
     * This can also be set using the BASE_URL environmental variable.
     *
     * @default "http://localhost"
     * @examples ["http://localhost", "http://192.168.0.101", "https://ms.myDomain.tld"]
     * */
    baseUrl: z.string().optional().meta({
        description: "Set the Base URL the application should assume the UI is served from.",
        default: "http://localhost",
        examples: ["http://localhost", "http://192.168.0.101", "https://ms.myDomain.tld"]
    }),

    logging: z.object({
        level: logLevelSchema.optional(),
        file: z.union([logLevelSchema, z.literal(false), fileLogOptionsSchema]).optional(),
        console: logLevelSchema.optional(),
    }).optional(),

    /**
     * Disable web server from running/listening on port.
     *
     * This will also make any ingress sources (Plex, Jellyfin, Tautulli, etc...) unusable
     * */
    disableWeb: z.boolean().optional().meta({
        description: "Disable web server from running/listening on port."
    }),

    /**
     * Enables ALL relevant logging and debug options for all sources/clients, when none are defined.
     *
     * This is a convenience shortcut for enabling all output needed to troubleshoot an issue and does not need to be on for normal operation.
     *
     * It can also be enabled with the environmental variable DEBUG_MODE=true
     *
     * @default false
     * @examples [false]
     * */
    debugMode: z.boolean().optional().meta({
        description: "Enables ALL relevant logging and debug options for all sources/clients, when none are defined.",
        default: false,
        examples: [false]
    }),

    cache: cacheConfigUserSchema.optional(),

    transformers: z.array(transformerCommonConfigSchema).optional(),

    database: z.object({
        retention: retentionConfigDurationValueSchema.optional(),
    }).optional(),
});

export type AIOConfig = z.infer<typeof aioConfigSchema>;

export const aioClientConfigSchema = z.object({
    clientDefaults: requestRetryOptionsSchema.optional(),
    clients: z.array(clientAIOConfigSchema).optional(),
});

export type AIOClientConfig = z.infer<typeof aioClientConfigSchema>;

export const aioClientRelaxedConfigSchema = z.object({
    clientDefaults: requestRetryOptionsSchema.optional(),
    clients: z.array(z.looseObject({})).optional(),
});

export type AIOClientRelaxedConfig = z.infer<typeof aioClientRelaxedConfigSchema>;

export const aioSourceConfigSchema = z.object({
    sourceDefaults: sourceRetryOptionsSchema.optional(),
    sources: z.array(sourceAIOConfigSchema).optional(),
});

export type AIOSourceConfig = z.infer<typeof aioSourceConfigSchema>;

export const aioSourceRelaxedConfigSchema = z.object({
    sourceDefaults: sourceRetryOptionsSchema.optional(),
    sources: z.array(z.looseObject({})).optional(),
});

export type AIOSourceRelaxedConfig = z.infer<typeof aioSourceRelaxedConfigSchema>;

export const typedConfigSchema = z.object({
    type: z.string(),
});

export type TypedConfig = z.infer<typeof typedConfigSchema>;
