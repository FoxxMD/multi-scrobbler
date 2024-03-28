import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface SpotifySourceData extends CommonSourceData, PollingOptions {
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
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * It is unlikely you should need to change this unless you scrobble many very short tracks often
     *
     * Reading:
     * * https://developer.spotify.com/documentation/web-api/guides/rate-limits/
     * * https://medium.com/mendix/limiting-your-amount-of-calls-in-mendix-most-of-the-time-rest-835dde55b10e
     *   * Rate limit may ~180 req/min
     * * https://community.spotify.com/t5/Spotify-for-Developers/Web-API-ratelimit/m-p/5503150/highlight/true#M7930
     *   * Informally indicated as 20 req/sec? Probably for burstiness
     *
     * @default 10
     * @examples [10]
     * */
    interval?: number
}

export interface SpotifySourceConfig extends CommonSourceConfig {
    data: SpotifySourceData
}

export interface SpotifySourceAIOConfig extends SpotifySourceConfig {
    type: 'spotify'
}
