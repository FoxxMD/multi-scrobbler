import * as z from "zod";
import {commonClientConfigSchema, commonClientDataSchema, type EnvClientSchema} from "./index.ts";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";

export const statusTypeSchema = z.union([z.literal("online"), z.literal("idle"), z.literal("dnd"), z.literal("invisible")]);

export type StatusType = z.infer<typeof statusTypeSchema>;

const ipcLocationTupleSchema = z.custom<[number, string]>((val) => Array.isArray(val) && val.length === 2 && typeof val[0] === 'number' && typeof val[1] === 'string');

export const discordDataSchema = z.object({
    token: z.string().optional(),
    applicationId: z.string().optional(),
    artwork: z.union([z.boolean(), z.string(), z.array(z.string())]).optional(),
    artworkDefaultUrl: z.string().optional(),
    statusOverrideAllow: z.array(statusTypeSchema).optional(),
    listeningActivityAllow: z.union([z.string(), z.array(z.string())]).optional(),
    ipcLocations: z.union([z.string(), z.array(z.union([z.string(), ipcLocationTupleSchema]))]).optional()
});

export type DiscordData = z.infer<typeof discordDataSchema>;

const envDataSchema = z.object({
    DISCORD_TOKEN: discordDataSchema.shape.token,
    DISCORD_ARTWORK: discordDataSchema.shape.artwork,
    DISCORD_APPLICATION_ID: discordDataSchema.shape.applicationId,
    DISCORD_IPC_LOCATIONS: discordDataSchema.shape.ipcLocations,
    DISCORD_ARTWORK_DEFAULT_URL: discordDataSchema.shape.artworkDefaultUrl,
    DISCORD_STATUS_OVERRIDE_ALLOW: statusTypeSchema.optional(),
    DISCORD_LISTENING_ACTIVITY_ALLOW: discordDataSchema.shape.listeningActivityAllow,
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, DiscordClientConfig> = {
    env: envDataSchema,
    prefix: 'DISCORD',
    toConfig: (partial) => ({
            data: {
                token: partial.DISCORD_TOKEN,
                artwork: partial.DISCORD_ARTWORK,
                applicationId: partial.DISCORD_APPLICATION_ID,
                ipcLocations: partial.DISCORD_IPC_LOCATIONS,
                artworkDefaultUrl: partial.DISCORD_ARTWORK_DEFAULT_URL,
                statusOverrideAllow: partial.DISCORD_STATUS_OVERRIDE_ALLOW,
                listeningActivityAllow: partial.DISCORD_LISTENING_ACTIVITY_ALLOW
            }
    })
};

export const discordClientDataSchema = discordDataSchema.extend(commonClientDataSchema.shape);

export type DiscordClientData = z.infer<typeof discordClientDataSchema>;

export const discordClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using Koito as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Koito as a client",
        default: "client",
        examples: ["client"]
    }),
    data: discordClientDataSchema,
});

export type DiscordClientConfig = z.infer<typeof discordClientConfigSchema>;

export const discordClientAIOConfigSchema = z.object({
    ...discordClientConfigSchema.shape,
    type: z.literal('discord'),
}).meta({title: 'Discord'});

export type DiscordClientAIOConfig = z.infer<typeof discordClientAIOConfigSchema>;

export const activityTypeStringSchema = z.union([z.literal("playing"), z.literal("streaming"), z.literal("listening"), z.literal("watching"), z.literal("custom"), z.literal("competing"), z.literal("hanging")]);

export type ActivityTypeString = z.infer<typeof activityTypeStringSchema>;

export const ActivityTypes: ActivityTypeString[] = ['playing','streaming','listening','watching','custom','competing', 'hanging'];

export const discordStrongDataSchema = discordDataSchema.extend({
    artwork: z.union([z.boolean(), z.array(z.string())]).optional(),
    statusOverrideAllow: z.array(statusTypeSchema).optional(),
    listeningActivityAllow: z.array(z.string()).optional(),
    ipcLocations: z.array(z.union([z.string(), ipcLocationTupleSchema])).optional()
});

export type DiscordStrongData = z.infer<typeof discordStrongDataSchema>;

export const discordWSDataSchema = discordStrongDataSchema.extend({
    token: z.string(),
});

export type DiscordWSData = z.infer<typeof discordWSDataSchema>;

export const discordIPCDataSchema = discordStrongDataSchema.extend({
    applicationId: z.string(),
    //ipcLocations: (string | [number, string])[]
});

export type DiscordIPCData = z.infer<typeof discordIPCDataSchema>;

export interface ActivityAssets {
    largeImage?: string
    largeText?: string
    largeUrl?: string
    smallImage?: string
    smallText?: string
    smallUrl?: string
}

export interface ActivityTimestamps {
    start?: number
    end?: number
}

export type StatusDisplayType = 0 | 1 | 2;
export const STATUS_DISPLAY_TYPE = {
    Name: 0,
    State: 1,
    Details: 2
} as const satisfies Record<string, StatusDisplayType>

export type ActivityType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ActivityData {
    name: string
    details?: string
    detailsUrl?: string
    state?: string
    stateUrl?: string

    activityType?: ActivityType
    statusDisplayType?: StatusDisplayType

    assets?: ActivityAssets
    timestamps?: ActivityTimestamps

    createdAt: number
}

export const ACTIVITY_TYPE = {
    Playing: 0,
    Streaming: 1,
    Listening: 2,
    Watching: 3,
    Custom: 4,
    Competing: 5,
    Hanging: 6
} as const satisfies Record<string, ActivityType>

export const ARTWORK_PLACEHOLDER = 'https://raw.githubusercontent.com/FoxxMD/multi-scrobbler/master/assets/default-artwork.png';
export const MS_ART = 'https://raw.githubusercontent.com/FoxxMD/multi-scrobbler/master/assets/icon.png';
