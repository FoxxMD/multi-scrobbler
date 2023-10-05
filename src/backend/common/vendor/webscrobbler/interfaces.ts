export type WebScrobblerHookEvent = 'scrobble' | 'paused' | 'resumedplaying' | 'nowplaying' | string;
export interface WebScrobblerPayload {
    eventName: WebScrobblerHookEvent
    time?: number
    data: {
        song: WebScrobblerSong
        songs?: WebScrobblerSong[]
        currentlyPlaying?: boolean
    }
}

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

export interface WebScrobblerSong {
    controllerTabId: string | number;
    parsed: ParsedSongData;
    processed: ProcessedSongData;
    noRegex: ProcessedSongData;
    flags: Flags;
    metadata: Metadata;
    connectorLabel: string;
}
