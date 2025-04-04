import { LogOptions } from "@foxxmd/logging";
import { ClientAIOConfig } from "./client/clients.ts";
import { CommonClientOptions } from "./client/index.ts";
import { RequestRetryOptions } from "./common.ts";
import { WebhookConfig } from "./health/webhooks.ts";
import { CommonSourceOptions, SourceRetryOptions } from "./source/index.ts";
import { SourceAIOConfig } from "./source/sources.ts";
import { ClientType, SourceType } from "../Atomic.ts";


export interface SourceDefaults extends CommonSourceOptions {
}

export interface ClientDefaults extends CommonClientOptions {
}

export interface AIOConfig {
    sourceDefaults?: SourceDefaults
    clientDefaults?: ClientDefaults
    sources?: SourceAIOConfig[]
    clients?: ClientAIOConfig[]

    webhooks?: WebhookConfig[]

    /**
     * Set the port the multi-scrobbler UI will be served from
     *
     * @default 9078
     * @examples [9078]
     * */
    port?: number

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
    baseUrl?: string

    logging?: LogOptions

    /**
     * Disable web server from running/listening on port.
     *
     * This will also make any ingress sources (Plex, Jellyfin, Tautulli, etc...) unusable
     * */
    disableWeb?: boolean

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
    debugMode?: boolean
}

export interface AIOClientConfig {
    clientDefaults?: RequestRetryOptions
    clients?: ClientAIOConfig[]
}

export interface AIOClientRelaxedConfig {
    clientDefaults?: RequestRetryOptions
    clients?: object[]
}

export interface AIOSourceConfig {
    sourceDefaults?: SourceRetryOptions
    sources?: SourceAIOConfig[]
}

export interface AIOSourceRelaxedConfig {
    sourceDefaults?: SourceRetryOptions
    sources?: object[]
}

export interface TypedConfig<T = string> {
    type: T
    // [key: string]: any
}