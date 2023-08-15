import {Dayjs} from "dayjs";
import {FixedSizeList} from 'fixed-size-list';
import {MESSAGE} from 'triple-beam';
import {Logger} from '@foxxmd/winston';
import TupleMap from "../TupleMap.js";
import is from "@sindresorhus/is";
import {Request, Response} from "express";
import {NextFunction, ParamsDictionary, Query} from "express-serve-static-core";

export type SourceType = 'spotify' | 'plex' | 'tautulli' | 'subsonic' | 'jellyfin' | 'lastfm' | 'deezer' | 'ytmusic' | 'mpris' | 'mopidy' | 'listenbrainz' | 'jriver' | 'kodi';
export const sourceTypes: SourceType[] = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm', 'deezer', 'ytmusic', 'mpris', 'mopidy', 'listenbrainz', 'jriver', 'kodi'];

export const lowGranularitySources: SourceType[] = ['subsonic','ytmusic'];

export type ClientType = 'maloja' | 'lastfm' | 'listenbrainz';
export const clientTypes: ClientType[] = ['maloja', 'lastfm', 'listenbrainz'];

export type InitState = 0 | 1 | 2;
export const NOT_INITIALIZED: InitState = 0;
export const INITIALIZING: InitState = 1;
export const INITIALIZED: InitState = 2;
export const initStates: InitState[] = [NOT_INITIALIZED, INITIALIZING, INITIALIZED];

export type ReadyState = 0 | 1 | 2;
export const NOT_READY: ReadyState = 0;
export const GETTING_READY: ReadyState = 1;
export const READY: ReadyState = 2;
export const readyStates: ReadyState[] = [NOT_READY, GETTING_READY, READY];

export interface InternalConfig {
    localUrl: string
    configDir: string

    logger: Logger
}

export type ReportedPlayerStatus = 'playing' | 'stopped' | 'paused' | 'unknown';
export const REPORTED_PLAYER_STATUSES = {
    playing: 'playing' as ReportedPlayerStatus,
    stopped: 'stopped' as ReportedPlayerStatus,
    paused: 'paused' as ReportedPlayerStatus,
    unknown: 'unknown' as ReportedPlayerStatus
}

export type CalculatedPlayerStatus = ReportedPlayerStatus | 'stale' | 'orphaned';
export const CALCULATED_PLAYER_STATUSES = {
    ...REPORTED_PLAYER_STATUSES,
    stale: 'stale' as CalculatedPlayerStatus,
    orphaned: 'orphaned' as CalculatedPlayerStatus,
}

export interface ConfigMeta {
    source: string
    mode?: string
    configureAs: string
}

export type SourceData = (PlayObject | PlayerStateData);

export interface PlayerStateData {
    platformId: PlayPlatformId
    play: PlayObject
    status?: ReportedPlayerStatus
    position?: number
    timestamp?: Dayjs
}

export const asPlayerStateData = (obj: object): obj is PlayerStateData => {
    return 'platformId' in obj && 'play' in obj;
}

export interface PlayProgress {
    timestamp: Dayjs
    position?: number
    positionPercent?: number
}
export type ListenRange = [PlayProgress, PlayProgress]

export interface TrackData {
    artists?: string[]
    album?: string
    track?: string
    /**
     * The length of the track, in seconds
     * */
    duration?: number

    meta?: {
        brainz?: {
            artist?: string
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
    playDate?: Dayjs
    /** Number of seconds the track was listened to */
    listenedFor?: number
    listenRanges?: ListenRange[]
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

    [key: string]: any
}

export interface PlayObject {
    data: PlayData,
    meta: PlayMeta
}

export interface FormatPlayObjectOptions {
    newFromSource?: boolean
    parsedFrom?: string

    [key: string]: any
}

export interface ProgressAwarePlayObject extends PlayObject {
    meta: PlayMeta & {
        initialTrackProgressPosition?: number
    }
}
export type DeviceId = string;
export type PlayUserId = string;
export type PlayPlatformId = [DeviceId, PlayUserId];

export type GroupedPlays = TupleMap<DeviceId,PlayUserId,ProgressAwarePlayObject[]>;

export type GroupedFixedPlays = TupleMap<DeviceId,PlayUserId,FixedSizeList<ProgressAwarePlayObject>>;

export const NO_DEVICE = 'NoDevice';
export const NO_USER = 'SingleUser';

export const SINGLE_USER_PLATFORM_ID: PlayPlatformId = [NO_DEVICE, NO_USER];

export interface TrackStringOptions<T = string> {
    include?: ('time' | 'artist' | 'track' | 'timeFromNow' | 'trackId')[]
    transformers?: {
        artists?: (a: string[]) => T | string
        track?: (t: string, hasExistingParts?: boolean) => T | string
        time?: (t: Dayjs) => T | string
        timeFromNow?: (t: Dayjs) => T  | string
        reducer?: (arr: (T|string)[]) => T //(acc: T, curr: T | string) => T
    }
}

export interface ScrobbledPlayObject {
    play: PlayObject
    scrobble: PlayObject
}


export interface RemoteIdentityParts {
    host: string,
    proxy: string | undefined,
    agent: string | undefined
}

export type LogLevel = "error" | "warn" | "info" | "verbose" | "debug";
export const logLevels = ['error', 'warn', 'info', 'verbose', 'debug'];

export interface LogConfig {
    level?: string
    file?: string | false
    stream?: string
    console?: string
}

export interface LogOptions {
    /**
     *  Specify the minimum log level for all log outputs without their own level specified.
     *
     *  Defaults to env `LOG_LEVEL` or `info` if not specified.
     *
     *  @default 'info'
     * */
    level?: LogLevel
    /**
     * Specify the minimum log level to output to rotating files. If `false` no log files will be created.
     * */
    file?: LogLevel | false
    /**
     * Specify the minimum log level streamed to the UI
     * */
    stream?: LogLevel
    /**
     * Specify the minimum log level streamed to the console (or docker container)
     * */
    console?: LogLevel
}

export const asLogOptions = (obj: LogConfig = {}): obj is LogOptions => {
    return Object.entries(obj).every(([key,  val]) => {
        if(key !== 'file') {
            return val === undefined || logLevels.includes(val.toLocaleLowerCase());
        }
        return val === undefined || val === false || logLevels.includes(val.toLocaleLowerCase());
    });
}

export interface LogInfo {
    message: string
    [MESSAGE]: string,
    level: string
    timestamp: string
    labels?: string[]
    transport?: string[]
}

// https://stackoverflow.com/questions/40510611/typescript-interface-require-one-of-two-properties-to-exist#comment116238286_49725198
export type RequireAtLeastOne<T, R extends keyof T = keyof T> = Omit<T, R> & {   [ P in R ] : Required<Pick<T, P>> & Partial<Omit<T, P>> }[R];

export const DEFAULT_SCROBBLE_DURATION_THRESHOLD: number = 30;

export interface ScrobbleThresholdResult {
    passes: boolean
    duration: {
        passes?: boolean
        value?: number
        threshold?: number
    }
    percent: {
        passes?: boolean
        value?: number
        threshold?: number
    }

}

export interface RegExResult {
    match: string,
    groups: string[],
    index: number
    named: NamedGroup
}

export interface NamedGroup {
    [name: string]: any
}

export type ExpressRequest = Request<ParamsDictionary, any, any, Query, Record<string, any>>;
export type ExpressResponse = Response<any, Record<string, any>>;
export type ExpressHandler = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>

export interface SourceStatusData {
    status: string;
    type: "spotify" | "plex" | "tautulli" | "subsonic" | "jellyfin" | "lastfm" | "deezer" | "ytmusic" | "mpris" | "mopidy" | "listenbrainz" | "jriver" | "kodi";
    display: string;
    tracksDiscovered: number;
    name: string;
    canPoll: boolean;
    hasAuth: boolean;
    hasAuthInteraction: boolean;
    authed: boolean;
}

export interface ClientStatusData {
    status: string;
    type: "maloja" | "lastfm" | "listenbrainz";
    display: string;
    tracksDiscovered: number;
    name: string;
    hasAuth: boolean;
}

export interface numberFormatOptions {
    toFixed: number,
    defaultVal?: any,
    prefix?: string,
    suffix?: string,
    round?: {
        type?: string,
        enable: boolean,
        indicate?: boolean,
    }
}
