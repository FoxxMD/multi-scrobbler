import { CommonSourceConfig, CommonSourceData } from "./index.ts";

export interface DeezerData extends CommonSourceData {
    /**
     * deezer client id
     *
     * @examples ["a89cba1569901a0671d5a9875fed4be1"]
     * */
    clientId: string
    /**
     * deezer client secret
     *
     * @examples ["ec42e09d5ae0ee0f0816ca151008412a"]
     * */
    clientSecret: string
    /**
     * deezer redirect URI -- required only if not the default shown here. URI must end in "callback"
     *
     * @default "http://localhost:9078/deezer/callback"
     * @examples ["http://localhost:9078/deezer/callback"]
     * */
    redirectUri?: string
    /**
     * optional, how long to wait before calling spotify for new tracks (in seconds)
     *
     * @default 60
     * @examples [60]
     * */
    interval?: number
}
export interface DeezerSourceConfig extends CommonSourceConfig {
    data: DeezerData
}

export interface DeezerSourceAIOConfig extends DeezerSourceConfig {
    type: 'deezer'
}
