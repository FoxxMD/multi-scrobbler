import type {CommonClientConfig, CommonClientData} from "./index.ts";
import type {ComponentType} from "../../../../../core/Atomic.ts";

export interface DiscordData {
    token?: string
    applicationId?: string
    artwork?: boolean | string | string[]
    artworkDefaultUrl?: string
    statusOverrideAllow?: string | StatusType[]
    listeningActivityAllow?: string | string[]
    ipcLocations?: string | (string | [number, string])[]
}

export interface DiscordClientData extends DiscordData, CommonClientData {}

export interface DiscordClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Koito as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: ComponentType
    data: DiscordClientData
}

export interface DiscordClientAIOConfig extends DiscordClientConfig {
    type: 'discord'
}

export type ActivityTypeString = 'playing' | 'streaming' | 'listening' | 'watching' | 'custom' | 'competing' | 'hanging';
export const ActivityTypes: ActivityTypeString[] = ['playing','streaming','listening','watching','custom','competing', 'hanging'];
export type StatusType = 'online' | 'idle' | 'dnd' | 'invisible';

export interface DiscordStrongData extends DiscordData {
    artwork?: boolean | string[]
    statusOverrideAllow?: StatusType[]
    listeningActivityAllow?: string[]
    ipcLocations?: (string | [number, string])[]
}

export interface DiscordWSData extends DiscordStrongData {
    token: string
}

export interface DiscordIPCData extends DiscordStrongData {
    applicationId: string
    //ipcLocations: (string | [number, string])[]
}

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