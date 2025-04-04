import { RequestRetryOptions } from "../common.ts";
import { CommonClientConfig, CommonClientData } from "./index.ts";

export interface MalojaClientData extends RequestRetryOptions, CommonClientData {
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

export interface MalojaClientConfig extends CommonClientConfig {
    data: MalojaClientData
}

export interface MalojaClientAIOConfig extends MalojaClientConfig {
    type: 'maloja'
}
