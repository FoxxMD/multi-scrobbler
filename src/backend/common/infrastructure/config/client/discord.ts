import { RequestRetryOptions } from "../common.js"
import { CommonClientConfig, CommonClientData } from "./index.js"

export interface DiscordData {
    //applicationId: string
    token: string
    artwork?: boolean | string[]
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