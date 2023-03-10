import {CommonSourceConfig, CommonSourceData} from "./index.js";
import {PollingOptions} from "../common.js";

export interface MopidyData extends CommonSourceData, PollingOptions {
    /**
     * URL of the Mopidy HTTP server to connect to
     *
     * You MUST have Mopidy-HTTP extension enabled: https://mopidy.com/ext/http
     *
     * multi-scrobbler connects to the WebSocket endpoint that ultimately looks like this => `ws://localhost:6680/mopidy/ws/`
     *
     * The URL you provide here will have all parts not explicitly defined filled in for you so if these are not the default you must define them.
     *
     * Parts => [default value]
     *
     * * Protocol => `ws://`
     * * Hostname => `localhost`
     * * Port => `6680`
     * * Path => `/mopidy/ws/`
     *
     *
     * @examples ["ws://localhost:6680/mopidy/ws/"]
     * @default "ws://localhost:6680/mopidy/ws/"
     * */
    url?: string

    /**
     * Do not scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive
     *
     * EX: Don't scrobble tracks from soundcloud by adding 'soundcloud' to this list.
     *
     * List is ignored if uriWhitelist is used.
     * */
    uriBlacklist?: string[]

    /**
     * Only scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive
     *
     * EX: Only scrobble tracks from soundcloud by adding 'soundcloud' to this list.
     *
     * */
    uriWhitelist?: string[]

    /**
     * Remove album data that matches any case-insensitive string from this list when scrobbling,
     *
     * For certain sources (Soundcloud) Mopidy does not have all track info (Album) and will instead use "Soundcloud" as the Album name. You can prevent multi-scrobbler from using this bad Album data by adding the fake name to this list. Multi-scrobbler will still scrobble the track, just without the bad data.
     *
     * @examples [["Soundcloud", "Mixcloud"]]
     * @default ["Soundcloud"]
     * */
    albumBlacklist?: string[]

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
}
export interface MopidySourceConfig extends CommonSourceConfig {
    data: MopidyData
}

export interface MopidySourceAIOConfig extends MopidySourceConfig {
    type: 'mopidy'
}
