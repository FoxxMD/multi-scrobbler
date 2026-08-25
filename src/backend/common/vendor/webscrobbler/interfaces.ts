import * as z from 'zod';

export type WebScrobblerHookEvent = 'scrobble' | 'paused' | 'resumedplaying' | 'nowplaying' | string;
const webScrobblerHookEventSchema = z.union([z.enum(['scrobble','paused','resumedplaying','nowplaying']), z.string()]);

interface ProcessedSongData {
    artist?: string | null;
    album?: string | null;
    albumArtist?: string | null;
    track?: string | null;
    duration?: number | null;
}

interface ParsedSongData extends ProcessedSongData {
    trackArt?: string | null;
    uniqueID?: string | null;
    originUrl?: string | null;
    isPodcast?: boolean | null;
    isPlaying?: boolean | null;
    currentTime?: number | null;
    isScrobblingAllowed?: boolean | null;
}

export type Flags =
    | {
    isScrobbled: boolean;
    isCorrectedByUser: boolean;
    isRegexEditedByUser: {
        track: boolean;
        artist: boolean;
        album: boolean;
        albumArtist: boolean;
    };
    isAlbumFetched: boolean;
    isValid: boolean;
    isMarkedAsPlaying: boolean;
    isSkipped: boolean;
    isReplaying: boolean;
}
    | Record<string, never>;

export type Metadata =
    | {
    label: string;
    startTimestamp: number;

    albumMbId?: string;
    albumUrl?: string;
    artistUrl?: string;
    notificationId?: string;
    trackArtUrl?: string;
    trackUrl?: string;
    userPlayCount?: number;
    userloved?: boolean;
}
    | Record<string, never>;

export interface Connector {
    id: string
    js: string
    label: string
}
export interface WebScrobblerSong {
    controllerTabId: string | number;
    connector: Connector
    parsed: ParsedSongData;
    processed: ProcessedSongData;
    noRegex: ProcessedSongData;
    flags: Flags;
    metadata: Metadata;
    connectorLabel: string;
}
export const webScrobblerSongSchema = z.object({
    controllerTabId: z.union([z.string(),z.number()]),
    connector: z.looseObject({}),
    parsed: z.looseObject({}),
    processed: z.looseObject({}),
    noRegex: z.looseObject({}),
    flags: z.looseObject({}),
    metadata: z.looseObject({}),
    connectorLabel: z.looseObject({})
})

export interface WebScrobblerPayload {
    eventName: WebScrobblerHookEvent
    time?: number
    data: {
        song: WebScrobblerSong
        songs?: WebScrobblerSong[]
        currentlyPlaying?: boolean
    }
}
export const webScrobblePayloadSchema = z.object({
    eventName: webScrobblerHookEventSchema,
    time: z.number().optional(),
    data: z.object({
        song: webScrobblerSongSchema,
        songs: z.array(webScrobblerSongSchema).optional(),
        currentlyPlaying: z.boolean().optional()
    })
})
