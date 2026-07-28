import * as z from "zod";
import type {AtprotoDid} from "@atcute/lexicons/syntax";

export const atProtoUserIdentifierDataSchema = z.object({
    /**
     * Identify the account to login as
     *
     * * For **App Password** Auth - your email
     * * For **Oauth** - your handle minus the @
     */
    identifier: z.string().meta({
        description: "Identify the account to login as"
    }),
    did: z.string().optional(),
});

export type ATProtoUserIdentifierData = z.infer<typeof atProtoUserIdentifierDataSchema>;

export const atProtoAppDataSchema = z.object({
    /**
     * The [App Password](https://atproto.com/specs/xrpc#app-passwords) you created for your account
     *
     * This is created under https://bsky.app/settings/app-passwords
     *
     * **Use this if you are self-hosting Multi-Scrobbler on localhost or accessed like http://IP:PORT**
     */
    appPassword: z.string().meta({
        description: "The [App Password](https://atproto.com/specs/xrpc#app-passwords) you created for your account"
    }),
});

export type ATProtoAppData = z.infer<typeof atProtoAppDataSchema>;

export interface HandleData {
    did: AtprotoDid
    pds: string
    handle: string
}