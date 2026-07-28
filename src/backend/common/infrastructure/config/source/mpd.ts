import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema} from "./index.ts";

export const mpdDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * URL:PORT of the MPD server to connect to
     *
     * To use this you must have TCP connections enabled for your MPD server https://mpd.readthedocs.io/en/stable/user.html#client-connections
     *
     * @examples ["localhost:6600"]
     * @default "localhost:6600"
     * */
    url: z.string().optional().meta({
        description: "URL:PORT of the MPD server to connect to",
        default: "localhost:6600",
        examples: ["localhost:6600"]
    }),

    /**
     * If using socket specify the path instead of url.
     *
     * trailing `~` is replaced by your home directory
     * */
    path: z.string().optional().meta({
        description: "If using socket specify the path instead of url."
    }),

    /**
     * Password for the server, if set https://mpd.readthedocs.io/en/stable/user.html#permissions-and-passwords
     * */
    password: z.string().optional().meta({
        description: "Password for the server, if set https://mpd.readthedocs.io/en/stable/user.html#permissions-and-passwords"
    }),

});

export type MPDData = z.infer<typeof mpdDataSchema>;

export const mpdSourceOptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
});

export type MPDSourceOptions = z.infer<typeof mpdSourceOptionsSchema>;

export const mpdSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: mpdDataSchema,
    options: mpdSourceOptionsSchema,
});

export type MPDSourceConfig = z.infer<typeof mpdSourceConfigSchema>;

export const mpdSourceAIOConfigSchema = z.object({
    ...mpdSourceConfigSchema.shape,
    type: z.literal('mpd'),
}).meta({title: 'MPD'});

export type MPDSourceAIOConfig = z.infer<typeof mpdSourceAIOConfigSchema>;

export type PlayerState = 'play' | 'stop' | 'pause';
