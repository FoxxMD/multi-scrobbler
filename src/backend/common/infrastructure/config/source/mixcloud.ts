import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";

export const mixcloudDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * Mixcloud username whose listening history should be monitored
     *
     * Only required when clientId/clientSecret are not defined. When authenticating
     * with an application the username is discovered from the authorized user's profile.
     *
     * This is the last part of your profile URL IE https://www.mixcloud.com/MyUsername/ => MyUsername
     *
     * @examples ["MyUsername"]
     * */
    username: z.string().optional().meta({
        description: "Mixcloud username whose listening history should be monitored. Only required when clientId/clientSecret are not defined.",
        examples: ["MyUsername"]
    }),
    /**
     * Client ID of a Mixcloud application, from https://www.mixcloud.com/developers/
     *
     * When defined (with clientSecret) the source authenticates with OAuth and can monitor
     * private (pro account) listening histories. The username is then optional.
     * */
    clientId: z.string().optional().meta({
        description: "Client ID of a Mixcloud application, from https://www.mixcloud.com/developers/. When defined (with clientSecret) the source authenticates with OAuth and can monitor private (pro account) listening histories."
    }),
    /**
     * Client secret of a Mixcloud application, from https://www.mixcloud.com/developers/
     * */
    clientSecret: z.string().optional().meta({
        description: "Client secret of a Mixcloud application, from https://www.mixcloud.com/developers/."
    }),
});

export type MixcloudData = z.infer<typeof mixcloudDataSchema>;

export const mixcloudSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: mixcloudDataSchema,
    options: commonSourceOptionsSchema.optional(),
});

export type MixcloudSourceConfig = z.infer<typeof mixcloudSourceConfigSchema>;

const envDataSchema = z.object({
    MIXCLOUD_USERNAME: mixcloudDataSchema.shape.username,
    MIXCLOUD_CLIENT_ID: mixcloudDataSchema.shape.clientId,
    MIXCLOUD_CLIENT_SECRET: mixcloudDataSchema.shape.clientSecret,
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, MixcloudSourceConfig> = {
    env: envDataSchema,
    prefix: 'MIXCLOUD',
    toConfig: (partial) => ({
        data: {
            username: partial.MIXCLOUD_USERNAME,
            clientId: partial.MIXCLOUD_CLIENT_ID,
            clientSecret: partial.MIXCLOUD_CLIENT_SECRET
        }
    })
};

export const mixcloudSourceAIOConfigSchema = z.object({
    ...mixcloudSourceConfigSchema.shape,
    type: z.literal('mixcloud'),
}).meta({title: 'Mixcloud'});

export type MixcloudSourceAIOConfig = z.infer<typeof mixcloudSourceAIOConfigSchema>;

/**
 * A single item returned by https://api.mixcloud.com/{username}/listens/
 *
 * Only fields used by MS are typed
 * */
export interface MixcloudListen {
    /** Unique path of the mix IE /SomeUploader/some-mix-slug/ */
    key: string
    url: string
    /** Name of the mix */
    name: string
    /** Length of the mix in seconds */
    audio_length?: number
    /** When the user listened to this mix, ISO8601 */
    listen_time: string
    /** Account that uploaded the mix */
    user: {
        name: string
        username: string
    }
    /** Hosts/DJs credited on the mix, may be empty */
    hosts?: {
        name: string
        username: string
    }[]
    pictures?: Record<string, string>
}
