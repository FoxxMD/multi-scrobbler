import { CommonClientConfig, CommonClientData } from "./index.js"

export interface DiscordData {
    token: string
    applicationId?: string
    artwork?: boolean | string | string[]
    artworkDefaultUrl?: string | false
    statusOverrideAllow?: string | StatusType[]
    activitiesOverrideAllow?: boolean | string | ActivityType[]
    applicationsOverrideDisallow?: string | string[]
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