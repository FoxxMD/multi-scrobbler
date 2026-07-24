import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const yandexMusicBridgeDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /** URL of the local Python bridge, for example http://yandex-music-bridge:9980 */
    url: z.string().meta({
        description: "URL of the local Python bridge, for example http://yandex-music-bridge:9980"
    }),
    /** Optional API key sent as X-API-Key to the bridge */
    apiKey: z.string().optional().meta({
        description: "Optional API key sent as X-API-Key to the bridge"
    }),
});

export type YandexMusicBridgeData = z.infer<typeof yandexMusicBridgeDataSchema>;

export const yandexMusicBridgeSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: yandexMusicBridgeDataSchema.optional(),
});

export type YandexMusicBridgeSourceConfig = z.infer<typeof yandexMusicBridgeSourceConfigSchema>;

export const yandexMusicBridgeSourceAIOConfigSchema = z.object({
    ...yandexMusicBridgeSourceConfigSchema.shape,
    type: z.literal('ymbridge'),
});

export type YandexMusicBridgeSourceAIOConfig = z.infer<typeof yandexMusicBridgeSourceAIOConfigSchema>;
