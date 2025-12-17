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
/**
 *  https://github.com/teal-fm/teal/blob/main/lexicons/fm.teal.alpha/feed/play.json
 *  https://github.com/teal-fm/teal/blob/main/lexicons/fm.teal.alpha/feed/defs.json
 * */
export interface ScrobbleRecord {
    $type: "fm.teal.alpha.feed.play",
    trackName: string,
    playedTime: string,
    duration?: number
    artists?: {artistName?: string, artistMbId?: string}[]
    /** Album name  */
    releaseName?: string
    /** A metadata string specifying the user agent where the format is `<app-identifier>/<version> (<kernel/OS-base>; <platform/OS-version>; <device-model>)` */
    submissionClientAgent: string,
    musicServiceBaseDomain?: string
    // musicbrainz
    recordingMbId?: string
    releaseMbId?: string
    isrc?: string,
    /** The URL associated with this track */
    originUrl?: string
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
