import type { ScrobbleViewBasic } from "@rocksky/sdk";
import type { IRateLimiterOptions } from "rate-limiter-flexible";
import * as z from 'zod';

export type RockskyScrobble = ScrobbleViewBasic;

const rockskyApiConfig = z.object({
    /**
     * Use this api configuration?
     * 
     * @default true
     */
    enable: z.boolean().optional().meta({description: 'Use this api configuration? Default is `true`.'}),
    /**
     * Base URL of a Rocksky server. Leave unset to use the official Musicbrainz instance.
     * 
     */
    url: z.string().optional().meta({
        description: 'Base URL of a Rocksky server. Leave unset to use the official Rockapp instance.'
    }),
    /**
     * milliseconds to wait until throwing a timeout error when waiting for a response.
     * 
     * @default 6000
     */
    requestTimeout: z.int().optional().meta({
        description: 'milliseconds to wait until throwing a timeout error when waiting for a response. Default is `6000`ms.'
    }),
    rate: z.object({
        requests: z.number().positive().optional().meta({
            description: 'max number of requests allowed during perTime unit of time',
            default: 1
        }),
        perTime: z.number().positive().optional().meta({
            description: 'A span of time (in seconds) during which requests made me made, resets after perTime',
            default: 1
        })
    }).optional(),
    /**
     * Access Token generated from https://rocksky.app/access-tokens in Rocksky for your account
     *
     * @examples ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaWQ....."]
     * */
    token: z.string().optional().meta({
        description: "Access Token generated from https://rocksky.app/access-tokens in Rocksky for your account",
        examples: ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaWQ....."]
        })
});

const rockskyApiClientConfig = z.object({
    apis: rockskyApiConfig.array().optional()
});
export type RockskyApiClientConfig = z.infer<typeof rockskyApiClientConfig>;
// export interface RockskyApiClientConfig {
//     apis: {
//         enable?: boolean
//         url?: string
//         token?: string
//         rate?: Partial<IRateLimiterOptions>
//     }[]
// }

export const ROCKSKY_URL = 'https://api.rocksky.app';