import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";
import {
    // @ts-expect-error weird typings?
    CollectionType
} from "@jellyfin/sdk/lib/generated-client/index.js";

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
     * */
    devicesAllow?: string | string[]
    /**
     * Do not scrobble if device or application name contains strings from this list (case-insensitive)
     * */
    devicesBlock?: string | string[]

    /**
     * Only scrobble if library name contains string from this list (case-insensitive)
     * */
    librariesAllow?: string | string[]
    /**
     * Do not scrobble if library name contains strings from this list (case-insensitive)
     * */
    librariesBlock?: string | string[]

    /**
     * Allow MS to scrobble audio media in libraries classified other than 'music'
     * 
     * `librariesAllow` will achieve the same result as this but this is more convenient if you do not want to explicitly list every library name or are only using `librariesBlock`
     */
    additionalAllowedLibraryTypes?: CollectionType[]

    /**
    * Force media with a type of "Unknown" to be counted as Audio
    * 
    * @default false
    */
    allowUnknown?: boolean

    /**
     * HOST:PORT of the Jellyfin server that your browser will be able to access from the frontend (and thus load images and links from)
     * If unspecified it will use the normal server HOST and PORT from the `url`
     * Necessary if you are using a reverse proxy or other network configuration that prevents the frontend from accessing the server directly
     * */
    frontendUrlOverride?: string
}

export interface JellyApiOptions extends CommonSourceOptions {
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


export type JellyfinCompatConfig = JellyApiSourceConfig | JellySourceConfig;