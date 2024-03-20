import { CommonSourceOptions, ScrobbleThresholds, SourceRetryOptions } from "./source/index.js";
import { RequestRetryOptions } from "./common.js";
import { SourceAIOConfig } from "./source/sources.js";
import { ClientAIOConfig } from "./client/clients.js";
import { WebhookConfig } from "./health/webhooks.js";
import {LogOptions} from "@foxxmd/logging";


export interface SourceDefaults extends SourceRetryOptions {
    /**
     * Set thresholds for when multi-scrobbler should consider a tracked play to be "scrobbable". If both duration and percent are defined then if either condition is met the track is scrobbled.
     * */
    scrobbleThresholds?: ScrobbleThresholds
    options?: CommonSourceOptions
}
export interface AIOConfig {
    sourceDefaults?: SourceDefaults
    clientDefaults?: RequestRetryOptions
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

export interface AIOSourceConfig {
    sourceDefaults?: SourceRetryOptions
    sources?: SourceAIOConfig[]
}
