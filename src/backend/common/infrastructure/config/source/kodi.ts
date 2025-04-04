import { PollingOptions } from "../common.ts";
import { CommonSourceConfig, CommonSourceData } from "./index.ts";


export interface KodiData extends CommonSourceData, PollingOptions {
    /**
     * URL of the Kodi HTTP server to connect to
     *
     * multi-scrobbler connects to the Web Service Interface endpoint that ultimately looks like this => `http://yourDomain:8080/jsonrpc`
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `http://`
     * * Hostname => `localhost`
     * * Port => `8080`
     * * Path => `/jsonrpc`
     *
     *
     * @examples ["http://localhost:8080/jsonrpc"]
     * @default "http://localhost:8080/jsonrpc"
     * */
    url: string

    /**
     * The username set for Remote Control via Web Sever
     * */
    username: string

    /**
     * The password set for Remote Control via Web Sever
     * */
    password: string
}
export interface KodiSourceConfig extends CommonSourceConfig {
    data: KodiData
}

export interface KodiSourceAIOConfig extends KodiSourceConfig {
    type: 'kodi'
}
