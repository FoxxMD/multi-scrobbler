import {Dayjs} from "dayjs";
import {FixedSizeList} from 'fixed-size-list';
import {MESSAGE} from 'triple-beam';
import {Logger} from "winston";

export type SourceType = 'spotify' | 'plex' | 'tautulli' | 'subsonic' | 'jellyfin' | 'lastfm' | 'deezer' | 'ytmusic' | 'mpris' | 'mopidy';
export const sourceTypes: SourceType[] = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm', 'deezer', 'ytmusic', 'mpris', 'mopidy'];

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

export interface ConfigMeta {
    source: string
    mode?: string
    configureAs: string
}

export interface PlayData {
    artists?: string[]
    album?: string
    track?: string
    /**
     * The length of the track, in seconds
     * */
    duration?: number
    /**
     * The date the track was played at
     * */
    playDate?: Dayjs
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

export type GroupedPlays = Map<string, ProgressAwarePlayObject[]>;

export type GroupedFixedPlays = Map<string, FixedSizeList<ProgressAwarePlayObject>>;

export interface TrackStringOptions {
    include?: ('time' | 'artist' | 'track' | 'timeFromNow' | 'trackId')[]
    transformers?: {
        artists?: (a: string[]) => string
        track?: (t: string) => string
        time?: (t: Dayjs) => string
        timeFromNow?: (t: Dayjs) => string
    }
}

export interface ScrobbledPlayObject {
    play: PlayObject
    scrobble: PlayObject
}

export interface MalojaV2ScrobbleData {
    artists: string[]
    title: string
    album: string
    /**
     * Length of the track
     * */
    duration: number
    /**
     * unix timestamp (seconds) scrobble was made at
     * */
    time: number
}

export interface MalojaV3ScrobbleData {
    /**
     * unix timestamp (seconds) scrobble was made at
     * */
    time: number
    track: {
        artists: string[]
        title: string
        album?: {
            name: string
            artists: string[]
        }
        /**
         * length of the track
         * */
        length: number
    }
    /**
     * how long the track was listened to before it was scrobbled
     * */
    duration: number
}

export type MalojaScrobbleData = MalojaV2ScrobbleData | MalojaV3ScrobbleData;

export interface MalojaScrobbleRequestData {
    key: string
    title: string
    album: string
    time: number
    length: number
}

export interface MalojaScrobbleV2RequestData extends MalojaScrobbleRequestData {
    artist: string
}

export interface MalojaScrobbleV3RequestData extends MalojaScrobbleRequestData {
    artists: string[]
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
