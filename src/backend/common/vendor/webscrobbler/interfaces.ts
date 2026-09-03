import * as z from 'zod';

//export type WebScrobblerHookEvent = 'scrobble' | 'paused' | 'resumedplaying' | 'nowplaying' | string;
const webScrobblerHookEventSchema = z.union([z.enum(['scrobble','paused','resumedplaying','nowplaying']), z.string()]);
export type WebScrobblerHookEvent = z.infer<typeof webScrobblerHookEventSchema>;

const processedSongDataSchema = z.object({
    artist: z.string().nullish(),
    album: z.string().nullish(),
    albumArtist: z.string().nullish(),
    track: z.string().nullish(),
    duration: z.number().positive().nullish(),
});
export type ProcessedSongData = z.output<typeof processedSongDataSchema>;

const parsedSongDataSchema = processedSongDataSchema.extend({
    trackArt: z.string().nullish(),
    uniqueID: z.string().nullish(),
    originUrl: z.string().nullish(),
    isPodcast: z.boolean().nullish(),
    isPlaying: z.boolean().nullish(),
    currentTime: z.number().nullish(),
    isScrobblingAllowed: z.boolean().nullish(),
});
export type ParsedSongData = z.output<typeof parsedSongDataSchema>;

// Record<string, never> means "no keys allowed" -> empty object with no extra props
export const flagsSchema = z.looseObject({
        isScrobbled: z.boolean(),
        isCorrectedByUser: z.boolean(),
        isRegexEditedByUser: z.object({
            track: z.boolean(),
            artist: z.boolean(),
            album: z.boolean(),
            albumArtist: z.boolean(),
        }),
        isAlbumFetched: z.boolean(),
        isValid: z.boolean(),
        isMarkedAsPlaying: z.boolean(),
        isSkipped: z.boolean(),
        isReplaying: z.boolean(),
});
export type Flags = z.infer<typeof flagsSchema>;

export const metadataSchema = z.looseObject({
        label: z.string(),
        startTimestamp: z.int().positive(),
        albumMbId: z.string().optional(),
        albumUrl: z.string().optional(),
        artistUrl: z.string().optional(),
        notificationId: z.string().optional(),
        trackArtUrl: z.string().optional(),
        trackUrl: z.string().optional(),
        userPlayCount: z.int().optional(),
        userloved: z.boolean().optional(),
});
export type Metadata = z.infer<typeof metadataSchema>;

export const connectorSchema = z.object({
    id: z.string(),
    js: z.string(),
    label: z.string(),
});
export type Connector = z.infer<typeof connectorSchema>;

export const webScrobblerSongSchema = z.object({
    controllerTabId: z.union([z.string(),z.int().positive()]),
    connector: connectorSchema,
    parsed: parsedSongDataSchema,
    processed: processedSongDataSchema,
    noRegex: processedSongDataSchema,
    flags: flagsSchema,
    metadata: metadataSchema,
    connectorLabel: z.string().optional()
});
export type WebScrobblerSong = z.infer<typeof webScrobblerSongSchema>;

export const webScrobblePayloadSchema = z.object({
    eventName: webScrobblerHookEventSchema,
    time: z.int().positive().optional(),
    data: z.object({
        song: webScrobblerSongSchema,
        songs: z.array(webScrobblerSongSchema).optional(),
        currentlyPlaying: z.boolean().optional()
    })
});
export type WebScrobblerPayload = z.infer<typeof webScrobblePayloadSchema>;