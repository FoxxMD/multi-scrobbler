import { LogDataPretty, LogLevel } from "@foxxmd/logging";
import { Dayjs } from "dayjs";
import { ListenProgress } from "../backend/sources/PlayerState/ListenProgress.js";

export interface SourceStatusData {
    status: string;
    type: "spotify" | "plex" | "tautulli" | "subsonic" | "jellyfin" | "lastfm" | "deezer" | "ytmusic" | "mpris" | "mopidy" | "listenbrainz" | "jriver" | "kodi" | 'webscrobbler' | 'chromecast';
    display: string;
    tracksDiscovered: number;
    name: string;
    canPoll: boolean;
    hasAuth: boolean;
    hasAuthInteraction: boolean;
    authed: boolean;
    players: Record<string, SourcePlayerJson>
    sot: SOURCE_SOT_TYPES
    supportsUpstreamRecentlyPlayed: boolean;
}

export interface ClientStatusData {
    status: string;
    type: "maloja" | "lastfm" | "listenbrainz";
    display: string;
    scrobbled: number;
    deadLetterScrobbles: number
    queued: number
    name: string;
    hasAuth: boolean;
    hasAuthInteraction: boolean;
    authed: boolean;
    initialized: boolean;
}

export type PlayObjectIncludeTypes = 'album' | 'time' | 'artist' | 'track' | 'timeFromNow' | 'trackId' | 'comment' | 'platform' | 'session';
export const recentIncludes: PlayObjectIncludeTypes[] = ['time', 'timeFromNow', 'track', 'album', 'artist', 'comment'];

export interface TrackStringOptions<T = string> {
    include?: PlayObjectIncludeTypes[]
    transformers?: {
        artists?: (a: string[]) => T | string
        album?: (t: string,data: AmbPlayObject, hasExistingParts?: boolean) => T | string
        track?: (t: string,data: AmbPlayObject, hasExistingParts?: boolean) => T | string
        time?: (t: Dayjs, i?: ScrobbleTsSOC) => T | string
        timeFromNow?: (t: Dayjs) => T | string
        comment?: (c: string | undefined) => T | string
        platform?: (d: string | undefined, u: string | undefined, s: string | undefined) => T | string
        reducer?: (arr: (T | string)[]) => T //(acc: T, curr: T | string) => T
    }
}

export interface PlayProgress {
    timestamp: Dayjs
    position?: number
    positionPercent?: number
}

export interface PlayProgressPositional extends PlayProgress {
    position: number
}

export interface ListenRangeData {
    start: ListenProgress
    end: ListenProgress
}

export interface BrainzMeta {
    artist?: string[]
    albumArtist?: string
    album?: string
    track?: string
    releaseGroup?: string
}

export interface TrackData {
    artists?: string[]
    albumArtists?: string[]
    album?: string
    track?: string
    /**
     * The length of the track, in seconds
     * */
    duration?: number

    meta?: {
        brainz?: BrainzMeta
    }
}

export interface PlayData extends TrackData {
    /**
     * The date the track was played at
     * */
    playDate?: Dayjs | string
    /** Number of seconds the track was listened to */
    listenedFor?: number
    listenRanges?: ListenRangeData[]
    playDateCompleted?: Dayjs | string
}

export interface PlayMeta {
    source?: string

    /**
     * Specifies from what facet/data from the source this play was parsed from IE history, now playing, etc...
     * */
    parsedFrom?: string
    /**
     * Unique ID for this track, given by the Source
     * */
    trackId?: string

    /**
     * Atomic ID for this instance of played tracked IE a unique ID for "this track played at this time"
     * */
    playId?: string
    newFromSource?: boolean
    url?: {
        /**
         * The URL where this track can be found for the serice it was created from
         * 
         * IE
         * 
         * * Spotify Source <-- url to spotify track
         * * Maloja Client <--- url to specific scrobble
         */
        web: string
        /**
         * The URL where this play was originally played
         * 
         * IE Frank Sinatra - My way FROM youtube.com <-- URL pointing to specific video
         */
        origin?: string
        [key: string]: string
    }
    /**
     * Hot-linkable images for use with displaying art for this play
     */
    art?: {
        album?: string
        track?: string
        artist?: string
    }
    user?: string
    mediaType?: string
    server?: string
    library?: string
    /**
     * The position the "player" is at in the track at the time the play was reported, in seconds
     * */
    trackProgressPosition?: number
    /**
     * A unique identifier for the device playing this track
     * */
    deviceId?: string
    /** The ID/Key for individual sessions on a device/platform */
    sessionId?: string

    nowPlaying?: boolean

    scrobbleTsSOC?: ScrobbleTsSOC

    comment?: string

    [key: string]: any
}

export type ScrobbleTsSOC = 1 | 2;

export const SCROBBLE_TS_SOC_START: ScrobbleTsSOC = 1;
export const SCROBBLE_TS_SOC_END: ScrobbleTsSOC = 2;

export interface AmbPlayObject {
    data: PlayData,
    meta: PlayMeta
}

export const isPlayObject = (obj: object): obj is PlayObject => {
   return obj !== undefined && obj !== null &&  'data' in obj && typeof obj.data === 'object' && 'meta' in obj && typeof obj.meta === 'object';
}

export interface PlayObject extends AmbPlayObject {
    data: ObjectPlayData,
}

export interface JsonPlayObject extends AmbPlayObject {
    data: JsonPlayData
}

export interface ObjectPlayData extends PlayData {
    playDate?: Dayjs
    playDateCompleted?: Dayjs
}

export interface JsonPlayData extends PlayData {
    playDate?: Dayjs
    playDateCompleted?: Dayjs
}

export interface LogOutputConfig {
    level: LogLevel,
    sort: string,
    limit: number
}

export interface SourcePlayerObj {
    platformId: string,
    play: PlayObject,
    playFirstSeenAt?: string,
    playLastUpdatedAt?: string,
    playerLastUpdatedAt: strin
    position?: Second
    listenedDuration: Second
    status: {
        reported: string
        calculated: string
        stale: boolean
        orphaned: boolean
    }
}

export interface SourcePlayerJson extends Omit<SourcePlayerObj, 'play'> {
    play: JsonPlayObject
}

export interface SourceScrobble<PlayType> {
    source: string
    play: PlayType
}

export interface QueuedScrobble<PlayType> extends SourceScrobble<PlayType> {
    id: string
}

export interface DeadLetterScrobble<PlayType, RetryType = Dayjs> extends QueuedScrobble<PlayType> {
    id: string
    retries: number
    lastRetry?: RetryType
    error: string
}

export type Second = number;
export type Millisecond = number;

export type TemporalAccuracy = 1 | 2 | 3 | false;

export const TA_EXACT: TemporalAccuracy = 1;
export const TA_CLOSE: TemporalAccuracy = 2;
export const TA_FUZZY: TemporalAccuracy = 3;
export const TA_NONE: TemporalAccuracy = false;

export interface TemporalPlayComparison {
    match: TemporalAccuracy
    date?: {
        threshold: number
        diff: number
        fuzzyDurationDiff?: number
        fuzzyListenedDiff?: number
    }
    range?: false | ListenRangeData
}

export type SOURCE_SOT_TYPES = 'player' | 'history';
export const SOURCE_SOT = {
    PLAYER : 'player' as SOURCE_SOT_TYPES,
    HISTORY: 'history' as SOURCE_SOT_TYPES
}

export interface LeveledLogData extends LogDataPretty {
    levelLabel: string
}

export interface URLData {
    url: URL
    normal: string
    port: number
}

export type Joiner = ',' | '&' | '/' | '\\' | string;
export const JOINERS: Joiner[] = [',','&','/','\\'];

export type FinalJoiners = '&';
export const JOINERS_FINAL: FinalJoiners[] = ['&'];

export type Feat = 'ft' | 'feat' | 'vs' | 'ft.' | 'feat.' | 'vs.' | 'featuring'
export const FEAT: Feat[] = ['ft','feat','vs','ft.','feat.','vs.','featuring'];