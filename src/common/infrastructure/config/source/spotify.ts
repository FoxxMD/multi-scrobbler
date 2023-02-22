import {CommonSourceConfig, CommonSourceData} from "./index.js";

export interface SpotifySourceData extends CommonSourceData {
    /**
     * spotify client id
     *
     * @examples ["787c921a2a2ab42320831aba0c8f2fc2"]
     * */
    clientId: string
    /**
     * spotify client secret
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    clientSecret: string
    /**
     * spotify redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/callback"
     * @examples ["http://localhost:9078/callback"]
     * */
    redirectUri: string
    /**
     * optional, how long to wait before calling spotify for new tracks (in seconds)
     *
     * @default 60
     * @examples [60]
     * */
    interval?: number
}

export interface SpotifySourceConfig extends CommonSourceConfig {
    data: SpotifySourceData
}

export interface SpotifySourceAIOConfig extends SpotifySourceConfig {
    type: 'spotify'
}
