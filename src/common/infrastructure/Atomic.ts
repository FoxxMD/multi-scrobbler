import {Dayjs} from "dayjs";

export type SourceType = 'spotify' | 'plex' | 'tautulli' | 'subsonic' | 'jellyfin' | 'lastfm' | 'deezer';
export const sourceTypes: SourceType[] = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm', 'deezer'];

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
