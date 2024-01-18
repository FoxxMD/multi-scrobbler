import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface WebScrobblerData extends CommonSourceData {
    /**
     * The URL ending that should be used to identify scrobbles for this source
     *
     * In WebScrobbler's Webhook you must set an 'API URL'. All MS WebScrobbler sources must start like:
     *
     * http://localhost:9078/api/webscrobbler
     *
     * If you are using multiple WebScrobbler sources (scrobbles for many users) you must use a slug to match Sources with each users extension.
     *
     * Example:
     *
     * * slug: 'usera' => API URL: http://localhost:9078/api/webscrobbler/usera
     * * slug: 'userb' => API URL: http://localhost:9078/api/webscrobbler/userb
     *
     * If no slug is found from an extension's incoming webhook event the first WebScrobbler source without a slug will be used
     * */
    slug?: string | null

    /**
     * Block scrobbling from specific WebScrobbler Connectors
     *
     * @examples [["youtube"]]
     * */
    blacklist?: string | string[]

    /**
     * Only allow scrobbling from specific WebScrobbler Connectors
     *
     * @examples [["mixcloud","soundcloud","bandcamp"]]
     * */
    whitelist?: string | string[]

    /**
     * Additional options for WebScrobbler logging and tuning
     * */
    options?: {
        /**
         * Log raw WebScrobbler webhook payload to debug
         *
         * @default false
         * @examples [false]
         * */
        logPayload?: boolean

        /**
         * How MS should log when a WebScrobbler event fails a defined filter
         *
         * * `false` => do not log
         * * `debug` => log to DEBUG level
         * * `warn` => log to WARN level (default)
         *
         * @default warn
         * @examples ["warn"]
         * */
        logFilterFailure?: false | 'debug' | 'warn'
    }
}

export interface WebScrobblerSourceConfig extends CommonSourceConfig {
    data?: WebScrobblerData
}

export interface WebScrobblerSourceAIOConfig extends WebScrobblerSourceConfig {
    type: 'webscrobbler'
}
