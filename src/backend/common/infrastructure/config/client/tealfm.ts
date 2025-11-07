import { RequestRetryOptions } from "../common.js"
import { CommonClientConfig, CommonClientData } from "./index.js"

export interface TealData extends RequestRetryOptions {
}

export interface TealClientData extends TealData, CommonClientData {
    baseUri?: string
    identifier: string
    appPassword?: string
}

export interface TealClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Koito as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: TealClientData
}

export interface TealClientAIOConfig extends TealClientConfig {
    type: 'tealfm'
}