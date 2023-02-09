import {CommonClientConfig, CommonClientData} from "./index";

export interface MalojaClientConfig extends CommonClientConfig {
    data: CommonClientData & {
        /**
         * URL for maloja server
         * */
        url: string
        /**
         * API Key for Maloja server
         * */
        apiKey: string

    }
}

export interface MalojaClientAIOConfig extends MalojaClientConfig {
    type: 'maloja'
}
