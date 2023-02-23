import {Dayjs} from "dayjs";

export type SourceType = 'spotify' | 'plex' | 'tautulli' | 'subsonic' | 'jellyfin' | 'lastfm' | 'deezer' | 'ytmusic';
export const sourceTypes: SourceType[] = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm', 'deezer', 'ytmusic'];

export const lowGranularitySources: SourceType[] = ['subsonic','ytmusic'];

export type ClientType = 'maloja' | 'lastfm';
export const clientTypes: ClientType[] = ['maloja', 'lastfm'];

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
    duration?: number
    playDate?: Dayjs
}

export interface PlayMeta {
    source?: string
    sourceId?: string
    newFromSource?: boolean
    url?: {
        web: string
        [key: string]: string
    }
    trackLength?: number
    user?: string
    mediaType?: string
    server?: string
    library?: string

    [key: string]: any
}

export interface PlayObject {
    data: PlayData,
    meta: PlayMeta
}

export interface TrackStringOptions {
    include?: ('time' | 'artist' | 'track' | 'timeFromNow' | 'sourceId')[]
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
