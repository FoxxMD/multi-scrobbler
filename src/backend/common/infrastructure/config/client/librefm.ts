import { CommonClientConfig } from "./index.js";
import { LastfmClientConfig, LastfmClientOptions, LastfmData } from "./lastfm.js";

export interface LibrefmData extends LastfmData {
        /** 
         * (Optional) The host/domain.tld for your self-hosted Libre.fm instance
        */
        host?: string
        /** 
         * (Optional) The path (after host) for your self-hosted Libre.fm instance
        */
        path?: string
}

export interface LibrefmClientOptions extends LastfmClientOptions {

}

export interface LibrefmClientConfig extends LastfmClientConfig {

    data: LibrefmData
    options?: LibrefmClientOptions
}

export interface LibrefmClientAIOConfig extends LibrefmClientConfig {
    type: 'librefm'
}