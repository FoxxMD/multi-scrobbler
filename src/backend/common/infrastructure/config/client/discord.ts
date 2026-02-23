import { CommonClientConfig, CommonClientData } from "./index.js"

export interface DiscordData {
    token?: string
    applicationId?: string
    artwork?: boolean | string | string[]
    artworkDefaultUrl?: string
    statusOverrideAllow?: string | StatusType[]
    activitiesOverrideAllow?: boolean | string | ActivityType[]
    applicationsOverrideDisallow?: string | string[]
    ipcLocations?: (string | [number, string])[]
}

export interface DiscordClientData extends DiscordData, CommonClientData {}

export interface DiscordClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Koito as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: DiscordClientData
}

export interface DiscordClientAIOConfig extends DiscordClientConfig {
    type: 'discord'
}

export type ActivityType = 'playing' | 'streaming' | 'listening' | 'watching' | 'custom' | 'competing';
export const ActivityTypes: ActivityType[] = ['playing','streaming','listening','watching','custom','competing'];
export type StatusType = 'online' | 'idle' | 'dnd' | 'invisible';

export interface DiscordStrongData extends DiscordData {
    artwork?: boolean | string[]
    statusOverrideAllow?: StatusType[]
    activitiesOverrideAllow?: ActivityType[]
    applicationsOverrideDisallow?: string[]
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

export interface ActivityData {
    name: string
    details?: string
    detailsUrl?: string
    state?: string
    stateUrl?: string

    activityType?: 0 | 1 | 2 | 3 | 4 | 5
    statusDisplayType?: 0 | 1 | 2

    assets?: ActivityAssets
    timestamps?: ActivityTimestamps

    createdAt: number
}

export const ARTWORK_PLACEHOLDER = 'https://raw.githubusercontent.com/FoxxMD/multi-scrobbler/master/assets/default-artwork.png';
export const MS_ART = 'https://raw.githubusercontent.com/FoxxMD/multi-scrobbler/master/assets/icon.png';