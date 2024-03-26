import { CommonSourceConfig, CommonSourceData } from "./index.js";
import { PollingOptions } from "../common.js";

export interface SubsonicData extends CommonSourceData, PollingOptions {
    /**
     * URL of the subsonic media server to query
     *
     * @examples ["http://airsonic.local"]
     * */
    url: string
    /**
     * Username to login to the server with
     *
     * @example ["MyUser"]
     * */
    user: string

    /**
    * Password for the user to login to the server with
     *
     * @examples ["MyPassword"]
    * */
    password: string

    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * @default 10
     * @examples [10]
     * */
    interval?: number

    /**
     * When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)
     *
     * @default 30
     * @examples [30]
     * */
    maxInterval?: number

    /**
     * If your subsonic server is using self-signed certs you may need to disable TLS errors in order to get a connection
     *
     * WARNING: This should be used with caution as your traffic may not be encrypted.
     *
     * @default false
     * */
    ignoreTlsErrors?: boolean

    /**
     * Older Subsonic versions, and some badly implemented servers (Nextcloud), use legacy authentication which sends your password in CLEAR TEXT. This is less secure than the newer, recommended hashing authentication method but in some cases it is needed. See "Authentication" section here => https://www.subsonic.org/pages/api.jsp
     *
     * If this option is not specified it will be turned on if the subsonic server responds with error code 41 "Token authentication not supported for LDAP users." -- See Error Handling section => https://www.subsonic.org/pages/api.jsp
     *
     * @default false
     * */
    legacyAuthentication?: boolean
}
export interface SubSonicSourceConfig extends CommonSourceConfig {
    data: SubsonicData
}

export interface SubsonicSourceAIOConfig extends SubSonicSourceConfig {
    type: 'subsonic'
}
