import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema} from "../common.ts";
import {atProtoAppDataSchema, atProtoUserIdentifierDataSchema} from "./atproto.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, type EnvClientSchema} from "./index.ts";

export const tealDataSchema = z.object({
    ...requestRetryOptionsSchema.shape,
    ...atProtoUserIdentifierDataSchema.shape,
    ...atProtoAppDataSchema.partial().shape,
    /**
     * The base URI of the Multi-Scrobbler to use for ATProto OAuth
     *
     * Only include this if you want to use OAuth. The URI must be a non-IP/non-local domain using https: protocol.
    */
    baseUri: z.string().optional().meta({
        description: "The base URI of the Multi-Scrobbler to use for ATProto OAuth"
    }),
});

export type TealData = z.infer<typeof tealDataSchema>;

const envDataSchema = z.object({
    TEALFM_IDENTIFIER: z.string().meta({description: 'Identify the account to login as'}),
    TEALFM_APP_PW: z.string().optional().meta({description: 'The App Password you created for your account'}),
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, TealClientConfig> = {
    env: envDataSchema,
    toConfig: (partial) => ({
            data: {
                identifier: partial.TEALFM_IDENTIFIER,
                appPassword: partial.TEALFM_APP_PW
            }
    })
};

export const tealClientDataSchema = tealDataSchema.extend(commonClientDataSchema.shape);

export type TealClientData = z.infer<typeof tealClientDataSchema>;

export const tealClientOptionsSchema = z.object({
    ...commonClientOptionsSchema.shape,
});

export type TealClientOptions = z.infer<typeof tealClientOptionsSchema>;

export const tealClientConfigSchema = z.object({
    ...commonClientConfigSchema.shape,
    /**
     * Should always be `client` when using Tealfm as a client
     *
     * @default client
     * @examples ["client"]
     * */
    configureAs: componentTypeSchema.optional().meta({
        description: "Should always be `client` when using Tealfm as a client",
        default: "client",
        examples: ["client"]
    }),
    data: tealClientDataSchema,
    options: tealClientOptionsSchema.optional(),
});

export type TealClientConfig = z.infer<typeof tealClientConfigSchema>;

export const tealClientAIOConfigSchema = z.object({
    ...tealClientConfigSchema.shape,
    type: z.literal('tealfm'),
}).meta({title: 'teal.fm'});

export type TealClientAIOConfig = z.infer<typeof tealClientAIOConfigSchema>;

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
