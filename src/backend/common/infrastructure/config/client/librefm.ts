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

        /** 
         * (Optional) The host and path prefix for your Libre.fm instance
         * 
         * @default 'https://libre.fm/2.0/'
        */
        urlBase?: string
    /**
     * Optional URI to use for callback. Specify this if callback should be different than the default. MUST have "librefm/callback" in the URL somewhere.
     *
     * @default "http://localhost:9078/librefm/callback"
     * @examples ["http://localhost:9078/librefm/callback"]
     * */
    redirectUri?: string
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