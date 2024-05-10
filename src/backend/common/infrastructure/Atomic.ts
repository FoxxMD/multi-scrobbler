import { Logger } from '@foxxmd/logging';
import { Dayjs } from "dayjs";
import { Request, Response } from "express";
import { NextFunction, ParamsDictionary, Query } from "express-serve-static-core";
import { FixedSizeList } from 'fixed-size-list';
import { PlayMeta, PlayObject } from "../../../core/Atomic.js";
import TupleMap from "../TupleMap.js";

export type SourceType = 'spotify' | 'plex' | 'tautulli' | 'subsonic' | 'jellyfin' | 'lastfm' | 'deezer' | 'ytmusic' | 'mpris' | 'mopidy' | 'listenbrainz' | 'jriver' | 'kodi' | 'webscrobbler' | 'chromecast';
export const sourceTypes: SourceType[] = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm', 'deezer', 'ytmusic', 'mpris', 'mopidy', 'listenbrainz', 'jriver', 'kodi', 'webscrobbler', 'chromecast'];

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

export interface ScrobbledPlayObject {
    play: PlayObject
    scrobble: PlayObject
}


export interface RemoteIdentityParts {
    host: string,
    proxy: string | undefined,
    agent: string | undefined
}

// https://stackoverflow.com/questions/40510611/typescript-interface-require-one-of-two-properties-to-exist#comment116238286_49725198
export type RequireAtLeastOne<T, R extends keyof T = keyof T> = Omit<T, R> & {   [ P in R ] : Required<Pick<T, P>> & Partial<Omit<T, P>> }[R];

/**
 * https://www.last.fm/api/scrobbling (When is a scrobble a scrobble?)
 * https://github.com/krateng/maloja/blob/master/API.md#scrobbling-guideline
 * */
export const DEFAULT_SCROBBLE_DURATION_THRESHOLD: number = 240;
/**
 * https://www.last.fm/api/scrobbling (When is a scrobble a scrobble?)
 * https://github.com/krateng/maloja/blob/master/API.md#scrobbling-guideline
 * */
export const DEFAULT_SCROBBLE_PERCENT_THRESHOLD: number = 50;

export const DEFAULT_POLLING_INTERVAL: number = 10;
export const DEFAULT_POLLING_MAX_INTERVAL = 30;

export const DEFAULT_RETRY_MULTIPLIER: number = 1.5;

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

export const DELIMITERS = [',','&','/','\\'];

export const ARTIST_WEIGHT = 0.3;
export const TITLE_WEIGHT = 0.4;
export const TIME_WEIGHT = 0.5;
export const REFERENCE_WEIGHT = 0.5;
export const DUP_SCORE_THRESHOLD = 1;

// https://stackoverflow.com/a/70887388/1469797
export type ArbitraryObject = { [key: string]: unknown; };
export function isArbitraryObject(potentialObject: unknown): potentialObject is ArbitraryObject {
    return typeof potentialObject === "object" && potentialObject !== null;
}

export interface Authenticatable {
    requiresAuth: boolean
    requiresAuthInteraction: boolean
    authed: boolean
    authFailure?: boolean
    testAuth: () => Promise<any>
}

export interface MdnsDeviceInfo {
    name: string
    type: string
    addresses: string[]
}

export type AbstractApiOptions = Record<any, any> & { logger: Logger }

export type keyOmit<T, U extends keyof any> = T & { [P in U]?: never }
