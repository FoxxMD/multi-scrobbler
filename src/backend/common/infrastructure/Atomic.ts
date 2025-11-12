import { Logger } from '@foxxmd/logging';
import { SearchAndReplaceRegExp } from "@foxxmd/regex-buddy-core";
import { Dayjs } from "dayjs";
import { Request, Response } from "express";
import { NextFunction, ParamsDictionary, Query } from "express-serve-static-core";
import { FixedSizeList } from 'fixed-size-list';
import { isPlayObject, PlayMeta, PlayObject } from "../../../core/Atomic.js";
import TupleMap from "../TupleMap.js";

export type SourceType =
    'spotify'
    | 'plex'
    | 'tautulli'
    | 'subsonic'
    | 'jellyfin'
    | 'lastfm'
    | 'deezer'
    | 'endpointlz'
    | 'endpointlfm'
    | 'ytmusic'
    | 'mpris'
    | 'mopidy'
    | 'musiccast'
    | 'listenbrainz'
    | 'jriver'
    | 'kodi'
    | 'webscrobbler'
    | 'chromecast'
    | 'maloja'
    | 'musikcube'
    | 'mpd'
    | 'vlc'
    | 'icecast'
    | 'azuracast'
    | 'koito'
    | 'tealfm'
    | 'rocksky';

export const sourceTypes: SourceType[] = [
    'spotify',
    'plex',
    'tautulli',
    'subsonic',
    'jellyfin',
    'lastfm',
    'deezer',
    'endpointlz',
    'endpointlfm',
    'ytmusic',
    'mpris',
    'mopidy',
    'musiccast',
    'listenbrainz',
    'jriver',
    'kodi',
    'webscrobbler',
    'chromecast',
    'maloja',
    'musikcube',
    'mpd',
    'vlc',
    'icecast',
    'azuracast',
    'koito',
    'tealfm',
    'rocksky'
];

export const isSourceType = (data: string): data is SourceType => {
    return sourceTypes.includes(data as SourceType);
}

export const lowGranularitySources: SourceType[] = ['subsonic', 'ytmusic'];

export type ClientType =
    'maloja'
    | 'lastfm'
    | 'listenbrainz'
    | 'koito'
    | 'tealfm'
    | 'rocksky';
export const clientTypes: ClientType[] = [
    'maloja',
    'lastfm',
    'listenbrainz',
    'koito',
    'tealfm',
    'rocksky'
];
export const isClientType = (data: string): data is ClientType => {
    return clientTypes.includes(data as ClientType);
}

export interface ComponentIdentifier {
    type: SourceType | ClientType
    name: string
}

export interface SourceIdentifier extends ComponentIdentifier {
    type: SourceType
}

export interface ClientIdentifier extends ComponentIdentifier {
    type: ClientType
}

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
    localUrl: URL
    configDir: string
    version: string

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

export interface PlayerStateData extends PlayerStateDataMaybePlay {
    play: PlayObject
}

export interface PlayerStateDataMaybePlay {
    platformId: PlayPlatformId
    /** The ID/Key for individual sessions on a device/platform */
    sessionId?: string
    play?: PlayObject
    status?: ReportedPlayerStatus
    position?: number
    timestamp?: Dayjs
}

export const asPlayerStateData = (obj: object): obj is PlayerStateData => asPlayerStateDataMaybePlay(obj) && 'play' in obj && isPlayObject(obj.play)

export const asPlayerStateDataMaybePlay = (obj: object): obj is PlayerStateDataMaybePlay => 'platformId' in obj

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

export const DEFAULT_CLOSE_POSITION_ABSOLUTE = 12;
export const DEFAULT_CLOSE_POSITION_PERCENT = 0.15;
export const DEFAULT_DURATION_REPEAT_ABSOLUTE = 120;
export const DEFAULT_DURATION_REPEAT_PERCENT = 0.50;
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

export interface ConditionalSearchAndReplaceRegExp extends SearchAndReplaceRegExp{
    when?: WhenConditionsConfig
}

export type ConditionalSearchAndReplaceTerm = Omit<ConditionalSearchAndReplaceRegExp, 'test'>

export type SearchAndReplaceTerm = string | ConditionalSearchAndReplaceTerm;

export type PlayTransformParts<T> = PlayTransformPartsAtomic<T[]> & { when?: WhenConditionsConfig };

export type PlayTransformPartsArray<T> = PlayTransformParts<T>[];

export type PlayTransformPartsConfig<T> = PlayTransformPartsArray<T> | PlayTransformParts<T>;

export interface PlayTransformPartsAtomic<T> {
    title?: T
    artists?: T
    album?: T
}

export interface PlayTransformHooksConfig<T> {
    preCompare?: PlayTransformPartsConfig<T>
    compare?: {
        candidate?: PlayTransformPartsConfig<T>
        existing?: PlayTransformPartsConfig<T>
    }
    postCompare?: PlayTransformPartsConfig<T>
}

export interface PlayTransformHooks<T> extends PlayTransformHooksConfig<T> {
    preCompare?: PlayTransformPartsArray<T>
    compare?: {
        candidate?: PlayTransformPartsArray<T>
        existing?: PlayTransformPartsArray<T>
    }
    postCompare?: PlayTransformPartsArray<T>
}

export type PlayTransformRules = PlayTransformHooks<ConditionalSearchAndReplaceRegExp>

export type TransformHook = 'preCompare' | 'compare' | 'candidate' | 'existing' | 'postCompare';
export const TRANSFORM_HOOK = {
    preCompare: 'preCompare' as TransformHook,
    candidate: 'candidate' as TransformHook,
    existing: 'existing' as TransformHook,
    postCompare: 'postCompare' as TransformHook,
}
export type PlayTransformConfig = PlayTransformHooksConfig<SearchAndReplaceTerm>;
export type PlayTransformOptions = PlayTransformConfig & { log?: boolean | 'all' }

export type WhenParts<T> = PlayTransformPartsAtomic<T>;

export type WhenConditions<T> = WhenParts<T>[];
export type WhenConditionsConfig = WhenConditions<string>;

export type WithRequiredProperty<Type, Key extends keyof Type> = Type & {
  [Property in Key]-?: Type[Property];
};
export type CacheProvider = 'memory' | 'valkey' | 'file' | false;
export interface CacheConfig<T extends CacheProvider = CacheProvider> {
    provider: T;
    connection?: string;
    [key: string]: any
}
export type CacheMetadataProvider = CacheProvider;//Exclude<CacheProvider, 'file'>;
export type CacheMetadataConfig = CacheConfig<CacheMetadataProvider>;
export const asCacheProvider = (val: boolean | string): val is CacheProvider => {
    if(typeof val === 'string') {
        return ['memory', 'valkey', 'file'].includes(val);
    }
    return val === false;
}
export const asCacheMetadataProvider = (val: any): val is CacheScrobbleProvider => asCacheProvider(val);
export type CacheScrobbleProvider = CacheProvider;
export type CacheScrobbleConfig = CacheConfig<CacheScrobbleProvider>;
export const asCacheScrobbleProvider = (val: any): val is CacheScrobbleProvider => asCacheProvider(val);

export type CacheAuthProvider = CacheProvider;
export type CacheAuthConfig = CacheConfig<CacheAuthProvider>;
export const asCacheAuthProvider = (val: any): val is CacheAuthProvider => asCacheProvider(val);
export interface CacheConfigOptions {
    metadata?: CacheMetadataConfig;
    scrobble?: CacheScrobbleConfig;
    auth?: CacheAuthConfig;
}

