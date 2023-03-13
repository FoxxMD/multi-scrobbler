import {CommonSourceConfig, CommonSourceData} from "./index.js";
import {PollingOptions} from "../common.js";

export interface JRiverData extends CommonSourceData, PollingOptions {
    /**
     * URL of the JRiver HTTP server to connect to
     *
     * multi-scrobbler connects to the Web Service Interface endpoint that ultimately looks like this => `http://yourDomain:52199/MCWS/v1/`
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `http://`
     * * Hostname => `localhost`
     * * Port => `52199`
     * * Path => `/MCWS/v1/`
     *
     *
     * @examples ["http://localhost:52199/MCWS/v1/"]
     * @default "http://localhost:52199/MCWS/v1/"
     * */
    url: string

    /**
     * If you have enabled authentication, the username you set
     * */
    username?: string

    /**
     * If you have enabled authentication, the password you set
     * */
    password?: string
}
export interface JRiverSourceConfig extends CommonSourceConfig {
    data: JRiverData
}

export interface JRiverSourceAIOConfig extends JRiverSourceConfig {
    type: 'jriver'
}
