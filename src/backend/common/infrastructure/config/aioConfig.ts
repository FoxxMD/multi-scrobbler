import { CommonSourceOptions, ScrobbleThresholds, SourceRetryOptions } from "./source/index";
import { RequestRetryOptions } from "./common";
import { SourceAIOConfig } from "./source/sources";
import { ClientAIOConfig } from "./client/clients";
import { WebhookConfig } from "./health/webhooks";
import { LogOptions } from "../Atomic";

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
