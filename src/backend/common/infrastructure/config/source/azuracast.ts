import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, commonSourceOptionsSchema, manualListeningOptionsSchema, type EnvSourceSchema} from "./index.ts";
import { parseBoolStrict } from "../../../../utils.ts";

export const azuraStationInfoResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    shortcode: z.string(),
    is_public: z.boolean()
});

export type AzuraStationInfoResponse = z.infer<typeof azuraStationInfoResponseSchema>;

export const azuraListenersResponseSchema = z.object({
    total: z.number(),
    unique: z.number(),
    current: z.number()
});

export type AzuraListenersResponse = z.infer<typeof azuraListenersResponseSchema>;

export const azuraSongResponseSchema = z.object({
    id: z.string(),
    text: z.string(),
    artist: z.string(),
    title: z.string(),
    album: z.string(),
    genre: z.string(),
    isrc: z.string()
});

export type AzuraSongResponse = z.infer<typeof azuraSongResponseSchema>;

export const azuraNowPlayingResponseSchema = z.object({
    sh_id: z.number(),
    played_at: z.number(),
    duration: z.number(),
    streamer: z.string(),
    elapsed: z.number(),
    remaining: z.number(),
    song: azuraSongResponseSchema
});

export type AzuraNowPlayingResponse = z.infer<typeof azuraNowPlayingResponseSchema>;

export const azuraLiveResponseSchema = z.object({
    is_live: z.boolean(),
    streamer_name: z.string(),
    broadcast_start: z.number().nullable()
});

export type AzuraLiveResponse = z.infer<typeof azuraLiveResponseSchema>;

export const azuraStationResponseSchema = z.object({
    is_online: z.boolean(),
    station: azuraStationInfoResponseSchema,
    listeners: azuraListenersResponseSchema,
    now_playing: azuraNowPlayingResponseSchema
});

export type AzuraStationResponse = z.infer<typeof azuraStationResponseSchema>;


export const azuracastDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * Base URL of the Azuracast instance
     *
     * This does NOT include the station. If a station is included it will be ignored. Use `station` field to specify station, if necessary
     *
     *
     * @examples ["https://radio.mydomain.tld", "http://localhost:80"]
     * */
    url: z.url({
        protocol: /^https?|wss?$/,
    }).meta({
        description: "Base URL of the Azuracast instance",
        examples: ["https://radio.mydomain.tld", "http://localhost:80"]
    }),

    /**
     * The specific station to monitor
     *
     * Scrobbling will only occur if any of the monitor conditions are met AND the station is ONLINE.
     *
     * To monitor multiple stations create a Source for each station.
     *
     * @examples ["my-station-1"]
     * */
    station: z.string().meta({
        description: "The specific station to monitor",
        examples: ["my-station-1"]
    }),

    /**
     * Only activate scrobble monitoring if station
     *
     * * `true` => has any current listeners
     * * `number` => has EQUAL TO or MORE THAN X number of listeners
     *
     */
    monitorWhenListeners: z.union([z.boolean(), z.number()]).optional().meta({
        description: "Only activate scrobble monitoring if station"
    }),

    /**
     * Only activate scrobble monitoring if station has a live DJ/Streamer
     *
     * @default true
     */
    monitorWhenLive: z.boolean().optional().meta({
        description: "Only activate scrobble monitoring if station has a live DJ/Streamer",
        default: true
    }),

    /**
     * API Key used to access data about private streams
     *
     * https://www.azuracast.com/docs/developers/apis/#api-authentication
     * */
    apiKey: z.string().optional().meta({
        description: "API Key used to access data about private streams"
    })
});

export type AzuracastData = z.infer<typeof azuracastDataSchema>;

export const azuracastSourceoptionsSchema = z.object({
    ...commonSourceOptionsSchema.shape,
    ...manualListeningOptionsSchema.shape,
});

export type AzuracastSourceoptions = z.infer<typeof azuracastSourceoptionsSchema>;

export const azuracastSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: azuracastDataSchema
});

export type AzuracastSourceConfig = z.infer<typeof azuracastSourceConfigSchema>;

const envDataSchema = z.object({
    AZURA_STATION: azuracastDataSchema.shape.station,
    AZURA_URL: azuracastDataSchema.shape.url,
    AZURA_KEY: azuracastDataSchema.shape.apiKey,
    AZURA_LISTENERS_NUM: z.string().optional().transform((val) => val === undefined ? undefined : (!isNaN(Number.parseInt(val)) ? Number.parseInt(val) : parseBoolStrict(val))),
    AZURA_LIVE: z.stringbool().optional()
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, AzuracastSourceConfig> = {
    env: envDataSchema,
    prefix: 'AZURA',
    toConfig: (partial) => ({
            data: {
                url: partial.AZURA_URL,
                station: partial.AZURA_STATION,
                apiKey: partial.AZURA_KEY,
                monitorWhenListeners: partial.AZURA_LISTENERS_NUM,
                monitorWhenLive: partial.AZURA_LIVE
            }
    })
};

export const azuracastSourceAIOConfigSchema = z.object({
    ...azuracastSourceConfigSchema.shape,
    type: z.literal('azuracast')
}).meta({title: "Azuracast"});

export type AzuracastSourceAIOConfig = z.infer<typeof azuracastSourceAIOConfigSchema>;
