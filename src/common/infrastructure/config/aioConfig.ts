import {ScrobbleThresholds, SourceRetryOptions} from "./source/index.js";
import {RequestRetryOptions} from "./common.js";
import {SourceAIOConfig} from "./source/sources.js";
import {ClientAIOConfig} from "./client/clients.js";
import {WebhookConfig} from "./health/webhooks.js";
import {LogOptions} from "../Atomic.js";

export interface AIOConfig {
    sourceDefaults?: SourceRetryOptions &
        {
            /**
             * Set thresholds for when multi-scrobbler should consider a tracked play to be "scrobbable". If both duration and percent are defined then if either condition is met the track is scrobbled.
             * */
            scrobbleThresholds?: ScrobbleThresholds
        }
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
}

export interface AIOClientConfig {
    clientDefaults?: RequestRetryOptions
    clients?: ClientAIOConfig[]
}

export interface AIOSourceConfig {
    sourceDefaults?: SourceRetryOptions
    sources?: SourceAIOConfig[]
}
