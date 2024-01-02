import {Dayjs} from "dayjs";
import {MESSAGE} from "triple-beam";
import {ListenProgress} from "../backend/sources/PlayerState/ListenProgress";

export interface SourceStatusData {
    status: string;
    type: "spotify" | "plex" | "tautulli" | "subsonic" | "jellyfin" | "lastfm" | "deezer" | "ytmusic" | "mpris" | "mopidy" | "listenbrainz" | "jriver" | "kodi" | 'webscrobbler';
    display: string;
    tracksDiscovered: number;
    name: string;
    canPoll: boolean;
    hasAuth: boolean;
    hasAuthInteraction: boolean;
    authed: boolean;
    players: Record<string, SourcePlayerJson>
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

export type PlayObjectIncludeTypes = 'time' | 'artist' | 'track' | 'timeFromNow' | 'trackId';
export const recentIncludes: PlayObjectIncludeTypes[] = ['time', 'timeFromNow', 'track', 'artist'];

export interface TrackStringOptions<T = string> {
    include?: PlayObjectIncludeTypes[]
    transformers?: {
        artists?: (a: string[]) => T | string
        track?: (t: string,data: AmbPlayObject, hasExistingParts?: boolean) => T | string
        time?: (t: Dayjs) => T | string
        timeFromNow?: (t: Dayjs) => T | string
        reducer?: (arr: (T | string)[]) => T //(acc: T, curr: T | string) => T
    }
}

export interface PlayProgress {
    timestamp: Dayjs
    position?: number
    positionPercent?: number
}

export interface ListenRangeData {
    start: ListenProgress
    end: ListenProgress
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
        brainz?: {
            artist?: string[]
            albumArtist?: string
            album?: string
            track?: string
            releaseGroup?: string
        }
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
        web: string
        origin?: string
        [key: string]: string
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

    nowPlaying?: boolean

    [key: string]: any
}

export interface AmbPlayObject {
    data: PlayData,
    meta: PlayMeta
}

export interface PlayObject extends AmbPlayObject {
    data: ObjectPlayData,
}

export interface JsonPlayObject extends AmbPlayObject {
    data: JsonPlayData
}

export interface ObjectPlayData extends PlayData {
    playDate?: Dayjs
}

export interface JsonPlayData extends PlayData {
    playDate?: Dayjs
}

export type LogLevel = "error" | "warn" | "info" | "verbose" | "debug";
export const logLevels = ['error', 'warn', 'info', 'verbose', 'debug'];

export interface LogInfo {
    id: number
    message: string
    [MESSAGE]: string,
    level: string
    timestamp: string
    labels?: string[]
    transport?: string[]
}

export interface LogOutputConfig {
    level: LogLevel,
    sort: string,
    limit: number
}

export interface LogInfoJson extends LogInfo {
    formattedMessage: string
}

export interface SourcePlayerObj {
    platformId: string,
    play: PlayObject,
    playFirstSeenAt?: string,
    playLastUpdatedAt?: string,
    playerLastUpdatedAt: string
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
