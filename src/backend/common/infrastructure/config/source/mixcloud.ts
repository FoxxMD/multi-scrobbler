import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, type EnvSourceSchema} from "./index.ts";

export const mixcloudDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * Mixcloud username whose listening history should be monitored
     *
     * This is the last part of your profile URL IE https://www.mixcloud.com/MyUsername/ => MyUsername
     *
     * @examples ["MyUsername"]
     * */
    username: z.string().meta({
        description: "Mixcloud username whose listening history should be monitored",
        examples: ["MyUsername"]
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
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, MixcloudSourceConfig> = {
    env: envDataSchema,
    prefix: 'MIXCLOUD',
    toConfig: (partial) => ({
        data: {
            username: partial.MIXCLOUD_USERNAME
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
