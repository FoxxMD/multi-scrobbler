import type {AtprotoDid} from "@atcute/lexicons/syntax";

export interface ATProtoUserIdentifierData {
    /**
     * Identify the account to login as
     * 
     * * For **App Password** Auth - your email
     * * For **Oauth** - your handle minus the @
     */
    identifier: string
    did?: string
}

export interface ATProtoAppData {
    /**
     * The [App Password](https://atproto.com/specs/xrpc#app-passwords) you created for your account
     * 
     * This is created under https://bsky.app/settings/app-passwords
     * 
     * **Use this if you are self-hosting Multi-Scrobbler on localhost or accessed like http://IP:PORT**
     */
    appPassword: string
}

export interface HandleData {
    did: AtprotoDid
    pds: string
    handle: string
}