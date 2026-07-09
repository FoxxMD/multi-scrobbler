import { type ComponentType } from "../../../../../core/Atomic.ts";
import { type RequestRetryOptions } from "../common.ts";
import { type CommonClientConfig, type CommonClientData } from "./index.ts";

export interface MalojaData extends RequestRetryOptions {
    /**
     * URL for maloja server
     *
     * @examples ["http://localhost:42010"]
     * */
    url: string
    /**
     * API Key for Maloja server
     *
     * @examples ["myApiKey"]
     * */
    apiKey: string
}

export interface MalojaClientData extends MalojaData, CommonClientData {

}

export interface MalojaClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Maloja as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: ComponentType
    data: MalojaClientData
}

export interface MalojaClientAIOConfig extends MalojaClientConfig {
    type: 'maloja'
}
