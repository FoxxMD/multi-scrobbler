import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface JellyData extends CommonSourceData {
    /**
     * optional list of users to scrobble tracks from
     *
     * If none are provided tracks from all users will be scrobbled
     *
     * @examples [["MyUser1","MyUser2"]]
     * */
    users?: string | string[]
    /**
     * optional list of servers to scrobble tracks from
     *
     * If none are provided tracks from all servers will be scrobbled
     *
     * @examples [["MyServerName1"]]
     * */
    servers?: string | string[]
}

export interface JellyApiData extends CommonSourceData {
    /**
     * HOST:PORT of the Jellyfin server to connect to
     * */
    url: string
    /**
     * The username of the user to authenticate for or track scrobbles for
     * */
    user: string
    /**
     * Password of the username to authenticate for
     *
     * Required if `apiKey` is not provided.
     * */
    password?: string
    /**
     * API Key to authenticate with.
     *
     * Required if `password` is not provided.
     * */
    apiKey?: string

    /**
     * Only scrobble for specific users (case-insensitive)
     *
     * If `true` MS will scrobble activity from all users
     * */
    usersAllow?: string | true | string[]
    /**
     * Do not scrobble for these users (case-insensitive)
     * */
    usersBlock?: string | string[]

    /**
     * Only scrobble if device or application name contains strings from this list (case-insensitive)
     *
     * Note: This only applies to real-time scrobbling as JF does not track device info in user activity history
     * */
    devicesAllow?: string | string[]
    /**
     * Do not scrobble if device or application name contains strings from this list (case-insensitive)
     *
     * Note: This only applies to real-time scrobbling as JF does not track device info in user activity history
     * */
    devicesBlock?: string | string[]
}

export interface JellyApiOptions extends CommonSourceOptions {
/*    /!**
     * Set a persistent device id suffix
     * *!/
    deviceId?: string*/
}

export interface JellySourceConfig extends CommonSourceConfig {
    data: JellyData
}

export interface JellySourceAIOConfig extends JellySourceConfig {
    type: 'jellyfin'
}

export interface JellyApiSourceConfig extends CommonSourceConfig {
    data: JellyApiData
    options: JellyApiOptions
}

export interface JellyApiSourceAIOConfig extends JellyApiSourceConfig {
    type: 'jellyfin'
}
