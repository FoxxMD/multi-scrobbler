import {CommonSourceConfig, CommonSourceData} from "./index";

export interface DeezerData extends CommonSourceData {
    /**
     * deezer client id
     * */
    clientId: string
    /**
     * deezer client secret
     * */
    clientSecret: string
    /**
     * deezer redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/deezer/callback"
     * */
    redirectUri: string
    /**
     * optional, how long to wait before calling spotify for new tracks (in seconds)
     *
     * @default 60
     * */
    interval?: number
}
export interface DeezerSourceConfig extends CommonSourceConfig {
    data: DeezerData
}

export interface DeezerSourceAIOConfig extends DeezerSourceConfig {
    type: 'deezer'
}
