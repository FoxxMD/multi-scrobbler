import * as z from "zod";
import {commonClientConfigSchema, commonClientDataSchema} from "./index.ts";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";

export const statusTypeSchema = z.union([z.literal("online"), z.literal("idle"), z.literal("dnd"), z.literal("invisible")]);

export type StatusType = z.infer<typeof statusTypeSchema>;

// `z.tuple([z.number(), z.string()])` in the installed zod version infers as `[number?, string?, ...unknown[]]`
// rather than `[number, string]`, which breaks real consumers (e.g. DiscordIPCClient.ts) expecting a strict
// 2-tuple. `z.custom` sidesteps the bug while still checking shape at runtime.
const ipcLocationTupleSchema = z.custom<[number, string]>((val) => Array.isArray(val) && val.length === 2 && typeof val[0] === 'number' && typeof val[1] === 'string');

export const discordDataSchema = z.object({
    token: z.string().optional(),
    applicationId: z.string().optional(),
    artwork: z.union([z.boolean(), z.string(), z.array(z.string())]).optional(),
    artworkDefaultUrl: z.string().optional(),
    statusOverrideAllow: z.union([z.string(), z.array(statusTypeSchema)]).optional(),
    listeningActivityAllow: z.union([z.string(), z.array(z.string())]).optional(),
    ipcLocations: z.union([z.string(), z.array(z.union([z.string(), ipcLocationTupleSchema]))]).optional()
});

export type DiscordData = z.infer<typeof discordDataSchema>;

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
});

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
