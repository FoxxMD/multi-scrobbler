import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, nowPlayingOptionsSchema, type EnvClientSchema} from "./index.ts";
import { httpUrl } from "../../../../utils/ZodUtils.ts";
import { publicPlaySchema, publicPlayerSchema } from "../../../../../core/PlayJsonSchema.ts";

export const blackboxDataSchema = z.object({
    endpoint: httpUrl.meta({
        description: "URL scrobble payloads are sent to",
        examples: ["http://192.168.1.100:8080/scrobble"]
    }),
    payloadStyle: z.enum(["listenbrainz", "ms"]).optional().meta({
        description: "Format of the payload sent to endpoint",
        default: "ms",
        examples: ["ms"]
    }),
    headers: z.object({}).catchall(z.string()).optional().meta({
        description: "Additional headers to send with each request",
        examples: [{"Authorization": "Bearer mytoken"}]
    }),
    endpointHealth: httpUrl.optional().meta({
        description: "URL to use for testing service is reachable and ready. Any 2xx response is treated as success.",
        examples: ["http://192.168.1.100:8080"]
    }),
    endpointAuth: httpUrl.optional().meta({
        description: "URL to use for testing auth (through headers) is working. Any 2xx response is treated as success.",
        examples: ["http://192.168.1.100:8080/authenticated"]
    }),
});
export type BlackboxData = z.infer<typeof blackboxDataSchema>;

export const blackboxOptionsSchema = z.object({
    ...commonClientOptionsSchema.shape,
    ...nowPlayingOptionsSchema.shape,
});

const envDataSchema = z.object({
    BLACKBOX_ENDPOINT: blackboxDataSchema.shape.endpoint,
    BLACKBOX_ENDPOINT_HEALTH: blackboxDataSchema.shape.endpointHealth,
    BLACKBOX_PAYLOAD_STYLE: blackboxDataSchema.shape.payloadStyle,
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, BlackboxClientConfig> = {
    env: envDataSchema,
    prefix: 'BLACKBOX',
    toConfig: (partial) => ({
        configureAs: 'client',
        data: {
            endpoint: partial.BLACKBOX_ENDPOINT,
            endpointHealth: partial.BLACKBOX_ENDPOINT_HEALTH,
            payloadStyle: partial.BLACKBOX_PAYLOAD_STYLE
        }
    })
};

export const blackboxClientDataSchema = blackboxDataSchema.extend(commonClientDataSchema.shape);

export type BlackboxClientData = z.infer<typeof blackboxClientDataSchema>;

const {enable, options, ...commonConfigPrimary} = commonClientConfigSchema.shape;

export const blackboxClientConfigSchema = z.object({
    ...commonConfigPrimary,
    data: blackboxClientDataSchema,
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Blackbox as a client",
        default: "client",
        examples: ["client"]
    }),
    enable,
    options: blackboxOptionsSchema.optional(),
});

export type BlackboxClientConfig = z.infer<typeof blackboxClientConfigSchema>;

export const blackboxClientAIOConfigSchema = z.object({
    type: z.literal('blackbox'),
    ...blackboxClientConfigSchema.shape,
}).meta({title: "Blackbox"});

export type BlackboxClientAIOConfig = z.infer<typeof blackboxClientAIOConfigSchema>;

export const blackboxScrobblePayloadSchema = z.object({
    type: z.literal('scrobble'),
    play: publicPlaySchema,
}).meta({title: 'Blackbox Scrobble Payload'});
export type BlackboxScrobblePayload = z.output<typeof blackboxScrobblePayloadSchema>;

export const blackboxNowPlayingPayloadSchema = z.object({
    type: z.literal('nowPlaying'),
    play: publicPlayerSchema.nullable().meta({description: 'The Player reporting Now Playing, or null when Now Playing is cleared'}),
}).meta({title: 'Blackbox Now Playing Payload'});
export type BlackboxNowPlayingPayload = z.output<typeof blackboxNowPlayingPayloadSchema>;
