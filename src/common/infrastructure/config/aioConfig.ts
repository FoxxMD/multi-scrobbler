import {SourceRetryOptions} from "./source/index.js";
import {RequestRetryOptions} from "./common.js";
import {SourceAIOConfig} from "./source/sources.js";
import {ClientAIOConfig} from "./client/clients.js";
import {WebhookConfig} from "./health/webhooks.js";
import {LogOptions} from "../Atomic.js";

export interface AIOConfig {
    sourceDefaults?: SourceRetryOptions
    clientDefaults?: RequestRetryOptions
    sources?: SourceAIOConfig[]
    clients?: ClientAIOConfig[]

    webhooks?: WebhookConfig[]

    logging?: LogOptions
}

export interface AIOClientConfig {
    clientDefaults?: RequestRetryOptions
    clients?: ClientAIOConfig[]
}

export interface AIOSourceConfig {
    sourceDefaults?: SourceRetryOptions
    sources?: SourceAIOConfig[]
}
