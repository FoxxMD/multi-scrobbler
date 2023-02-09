import {CommonSourceConfig, CommonSourceData} from "./index";

export interface SpotifySourceData extends CommonSourceData {
    /**
     * spotify client id
     * */
    clientId: string
    /**
     * spotify client secret
     * */
    clientSecret: string
    /**
     * spotify redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/callback"
     * */
    redirectUri: string
    /**
     * optional, how long to wait before calling spotify for new tracks (in seconds)
     *
     * @default 60
     * */
    interval?: number
}

export interface SpotifySourceConfig extends CommonSourceConfig {
    data: SpotifySourceData
}

export interface SpotifySourceAIOConfig extends SpotifySourceConfig {
    type: 'spotify'
}
