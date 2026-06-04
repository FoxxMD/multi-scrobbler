import { AtprotoDid, DidDocument } from "@atproto/oauth-client-node";

export interface ATProtoUserIdentifierData {
    /**
     * Identify the account to login as
     * 
     * * For **App Password** Auth - your email
     * * For **Oauth** - your handle minus the @
     */
    identifier: string
    did?: AtprotoDid
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