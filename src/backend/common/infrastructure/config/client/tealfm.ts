import { RequestRetryOptions } from "../common.js"
import { CommonClientConfig, CommonClientData, CommonClientOptions } from "./index.js"

export interface TealData extends RequestRetryOptions {
        /**
     * The base URI of the Multi-Scrobbler to use for ATProto OAuth
     * 
     * Only include this if you want to use OAuth. The URI must be a non-IP/non-local domain using https: protocol.
    */
    baseUri?: string
    /**
     * Identify the account to login as
     * 
     * * For **App Password** Auth - your email
     * * For **Oauth** - your handle minus the @
     */
    identifier: string
    /**
     * The [App Password](https://atproto.com/specs/xrpc#app-passwords) you created for your account
     * 
     * This is created under https://bsky.app/settings/app-passwords
     * 
     * **Use this if you are self-hosting Multi-Scrobbler on localhost or accessed like http://IP:PORT**
     */
    appPassword?: string
}

export interface TealClientData extends TealData, CommonClientData {

}
export interface TealClientConfig extends CommonClientConfig {
    /**
     * Should always be `client` when using Tealfm as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs?: 'client' | 'source'
    data: TealClientData
    options?: TealClientOptions
}

export interface TealOptions {
}


export interface TealClientOptions extends TealOptions,CommonClientOptions {

}

export interface TealClientAIOConfig extends TealClientConfig {
    type: 'tealfm'
}
export interface TealArtistCredit {
    artistName?: string,
    /** The MusicBrainz artist ID URI, formatted as mbid:<uuid> */
    artistMbId?: string
}
/**
 *  https://github.com/teal-fm/teal/blob/main/lexicons/fm.teal.alpha/feed/play.json
 *  https://github.com/teal-fm/teal/blob/main/lexicons/fm.teal.alpha/feed/defs.json
 * */
export interface ScrobbleRecord {
    $type: "fm.teal.alpha.feed.play",
    trackName: string,
    playedTime: string,
    duration?: number
    artists?: TealArtistCredit[]
    /** Album name  */
    releaseName?: string
    /** A metadata string specifying the user agent where the format is `<app-identifier>/<version> (<kernel/OS-base>; <platform/OS-version>; <device-model>)` */
    submissionClientAgent: string,
    musicServiceBaseDomain?: string
    /** The MusicBrainz ID URI of the track, formatted as mbid:<uuid> */
    trackMbId?: string
    /** The MusicBrainz recording ID URI of the track, formatted as mbid:<uuid> */
    recordingMbId?: string
    /** The MusicBrainz release ID URI, formatted as mbid:<uuid> */
    releaseMbId?: string
    isrc?: string,
    /** The URL associated with this track */
    originUrl?: string
    /** Distinguishing information for track variants (e.g. 'Acoustic Version', 'Live at Wembley', 'Radio Edit', 'Demo'). Used to differentiate between different versions of the same base track while maintaining grouping capabilities. */
    trackDiscriminant?: string;
    /** Distinguishing information for release variants (e.g. 'Deluxe Edition', 'Remastered', '2023 Remaster', 'Special Edition'). Used to differentiate between different versions of the same base release while maintaining grouping capabilities. */
    releaseDiscriminant?: string;
    [x: string]: unknown
}

export interface StatusRecord {
    $type: "fm.teal.alpha.actor.status",
    /** item is just ScrobbleRecord, but without $type */
    item: Omit<ScrobbleRecord, '$type'>,
    time: string,
    expiry: string,
    [x: string]: unknown
}

export interface ListRecord<T> {
  uri: string;
  cid: string;
  value: T;
}
export interface RecordOptions {
    web?: string;
    playId?: string;
    user?: string;
}
