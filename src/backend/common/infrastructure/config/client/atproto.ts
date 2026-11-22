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
        description: "The [App Password](https://atproto.com/specs/xrpc#app-passwords) you created for your Atmosphere account"
    }),
});

export type ATProtoAppData = z.infer<typeof atProtoAppDataSchema>;

export interface HandleData {
    did: AtprotoDid
    pds: string
    handle: string
}
export const DEFAULT_RATE_LIMIT_RESERVE = 1000;

export const atProtoRateLimitOptionsSchema = z.object({
    /**
     * Points of the PDS rate limit to keep free. Scrobbling waits until the limit resets when fewer points are left.
     *
     * The PDS rate limit is shared by every app that writes to your account (Bluesky posts, likes, other scrobblers).
     *
     * @default 1000
     * */
    rateLimitReserve: z.number().int().nonnegative().optional().meta({
        description: "Points of the PDS rate limit to keep free. Scrobbling waits until the limit resets when fewer points are left.",
        default: DEFAULT_RATE_LIMIT_RESERVE,
        examples: [1000]
    }),
    /**
     * Points of the PDS rate limit to keep free when exporting from an Import/Export Job. Exports wait until the limit resets when fewer points are left.
     *
     * @default 1000
     * */
    exportRateLimitReserve: z.number().int().nonnegative().optional().meta({
        description: "Points of the PDS rate limit to keep free when exporting from a Job. Exports wait until the limit resets when fewer points are left.",
        default: DEFAULT_RATE_LIMIT_RESERVE,
        examples: [2000]
    }),
});

export type ATProtoRateLimitOptions = z.infer<typeof atProtoRateLimitOptionsSchema>;

const reserveEnv = (opt: z.ZodOptional<z.ZodNumber>) => z.coerce.number().int().nonnegative().optional().meta(opt.meta() ?? {});
export const atProtoRateLimitEnvSchemas = {
    reserve: () => reserveEnv(atProtoRateLimitOptionsSchema.shape.rateLimitReserve),
    exportReserve: () => reserveEnv(atProtoRateLimitOptionsSchema.shape.exportRateLimitReserve),
};
