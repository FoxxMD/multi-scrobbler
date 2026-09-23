import * as z from "zod";
import {componentTypeSchema} from "../../../../../core/Atomic.ts";
import {requestRetryOptionsSchema} from "../common.ts";
import {atProtoAppDataSchema, atProtoUserIdentifierDataSchema} from "./atproto.ts";
import {commonClientConfigSchema, commonClientDataSchema, commonClientOptionsSchema, type EnvClientSchema} from "./index.ts";

export const tealDataSchema = z.object({
    identifier: atProtoUserIdentifierDataSchema.shape.identifier.meta({
        description: "The **fully-qualified** handle, or identifier, for your Atmosphere account"
    }),
    appPassword: atProtoAppDataSchema.shape.appPassword.optional().meta(atProtoAppDataSchema.shape.appPassword.meta()),
    // /**
    //  * The base URI of the Multi-Scrobbler to use for ATProto OAuth
    //  *
    //  * Only include this if you want to use OAuth. The URI must be a non-IP/non-local domain using https: protocol.
    // */
    // baseUri: z.string().optional().meta({
    //     description: "The base URI of the Multi-Scrobbler to use for ATProto OAuth"
    // }),
    ...requestRetryOptionsSchema.shape,
});

export type TealData = z.infer<typeof tealDataSchema>;

export const tealClientDataSchema = z.object({
    ...tealDataSchema.shape,
    appPassword: atProtoAppDataSchema.shape.appPassword.meta(atProtoAppDataSchema.shape.appPassword.meta()),
    ...commonClientDataSchema.shape,

});

export type TealClientData = z.infer<typeof tealClientDataSchema>;

const envDataSchema = z.object({
    TEALFM_IDENTIFIER: tealClientDataSchema.shape.identifier,
    TEALFM_APP_PW: tealClientDataSchema.shape.appPassword,
});

export const envSchemas: EnvClientSchema<typeof envDataSchema, TealClientConfig> = {
    env: envDataSchema,
    prefix: 'TEALFM',
    toConfig: (partial) => ({
            configureAs: 'client',
            data: {
                identifier: partial.TEALFM_IDENTIFIER,
                appPassword: partial.TEALFM_APP_PW
            }
    })
};

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
