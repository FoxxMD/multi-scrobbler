import type { LogDataPretty, LogLevel } from "@foxxmd/logging";
import type { Dayjs } from "dayjs";
import type { AdditionalTrackInfoResponse } from "../backend/common/vendor/listenbrainz/interfaces.js";
import type { Merge, RequiredKeys, StrictOmit } from "ts-essentials";
import type { ErrorObject } from "serialize-error";
import type { PlayPlatformIdStr } from "../backend/common/infrastructure/Atomic.js";
import type { FlowControlTerm, TransformHook } from "../backend/common/infrastructure/Transform.js";
import type { Changeset } from "json-diff-ts";
import type { IParseBaseOptions } from 'qs'; 

export type ComponentTypeClient = 'client';
export const COMPONENT_TYPE_CLIENT: ComponentTypeClient = 'client';
export type ComponentTypeSource = 'source';
export const COMPONENT_TYPE_SOURCE: ComponentTypeSource = 'source';
export type ComponentType = ComponentTypeClient | ComponentTypeSource;
export const COMPONENT_TYPES: ComponentType[] = [COMPONENT_TYPE_SOURCE, COMPONENT_TYPE_CLIENT];
export const isComponentTypeSource = (type: string): type is ComponentTypeSource => type === COMPONENT_TYPE_SOURCE;
export const isComponentTypeClient = (type: string): type is ComponentTypeClient => type === COMPONENT_TYPE_CLIENT;
export const isComponentType = (type: string): type is ComponentType => isComponentTypeClient(type) || isComponentTypeSource(type);
export interface SourceStatusData {
    status: string;
    type: 'spotify'
    | 'plex'
    | 'tautulli'
    | 'subsonic'
    | 'jellyfin'
    | 'lastfm'
    | 'librefm'
    | 'deezer'
    | 'endpointlz'
    | 'endpointlfm'
    | 'ytmusic'
    | 'ymbridge'
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
    | 'rocksky'
    | 'sonos';
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
    supportsManualListening: boolean;
    manualListening?: boolean
    systemListeningBehavior?: boolean
}

export interface ClientStatusData {
    status: string;
    type: "maloja" | "lastfm" | "librefm" | "listenbrainz" | "koito" | "tealfm" | "rocksky" | "discord";
    display: string;
    scrobbled: number;
    deadLetterScrobbles: number
    deadLetterScrobblesTotal: number
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

export interface PlayProgressAmb<D extends DateLike = Dayjs> {
    timestamp: D
    position?: number
    positionPercent?: number
}

export interface PlayProgress extends PlayProgressAmb {
    timestamp: Dayjs
}

export interface PlayProgressPositional extends PlayProgress {
    position: number
}

export interface ListenRangeDataAmb {
    start: PlayProgressAmb
    end: PlayProgressAmb
}

export interface ListenRangeData extends ListenRangeDataAmb {
    start: PlayProgress
    end: PlayProgress
}

/** https://musicbrainz.org/doc/MusicBrainz_Database/Schema#Overview */
export interface BrainzMeta {
    /**
     *  artist_mbids
     * 
     *  All artists, including ft guests etc... go here */
    artist?: string[]
    /**
     * artists_mbid
     * 
     *  If multiple artists for track this is the "original" artist(s) who is releasing the single/album */
    albumArtist?: string[]
    /** 
     * release_mbid
     * 
     * The unique release like --> 1984 US release of "The Wall" by "Pink Floyd", release on label "Columbia Records" with catalog number "C2K 36183"  
     * */
    album?: string
    /** Unique track id, recording_mbid */
    recording?: string
    /**
     * 
     *  The "consolidated" album like -->  "The Wall" by "Pink Floyd" */
    releaseGroup?: string
    additionalInfo?: AdditionalTrackInfoResponse

    /** Position of track within Release */
    trackNumber?: number

    /** Track MBID (tid), not visible to end users and is only relevant in the context of a Release
     * 
     * Specifies the track on a specific Release. Not the same as the Recording MBID.
     */
    track?: string
}

export interface ArtistCredit {
    name: string
    mbid?: string
}

export interface SpotifyMeta {
    artist?: string[]
    albumArtist?: string[]
    album?: string
    track?: string
}

export interface TrackMeta {
    brainz?: BrainzMeta
    spotify?: SpotifyMeta
}

export interface TrackData {
    artists?: ArtistCredit[]
    albumArtists?: ArtistCredit[]
    album?: string
    track?: string
    /**
     * The length of the track, in seconds
     * */
    duration?: number

    meta?: TrackMeta

    /** International Standard Recording Code (ISRC) for this track 
     * 
     * https://musicbrainz.org/doc/ISRC
     */
    isrc?: string
}

export interface PlayData<D extends DateLike = Dayjs> extends TrackData {
    /**
     * The date the track was played at
     * */
    playDate?: D
    /** Number of seconds the track was listened to */
    listenedFor?: number
    listenRanges?: ListenRangeData[]
    playDateCompleted?: D
    repeat?: boolean
}

export interface ArtMeta {
    album?: string
    track?: string
    artist?: string
}

export type PlayMeta<D extends DateLike = Dayjs, T = {}> = Merge<PlayMetaBase<D>, T>;

export interface PlayMetaBase<D extends DateLike = Dayjs> {
    source?: string
    sourceSOT?: SOURCE_SOT_TYPES

    seenAt?: D

    //dbUid?: string
    //dbId?: number

    /*
    * If applicable, the name of the Service providing the track (Spotify, Tidal, etc...)
    */
    musicService?: string

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
    art?: ArtMeta
    user?: string
    mediaType?: string
    server?: string
    library?: string
    /**
     * The position the "player" is at in the track at the time the play was reported, in seconds
     * */
    trackProgressPosition?: number

    /*
    * Name of the media player (program)
    */
    mediaPlayerName?: string

   /*
    * Version of the media player (program)
    */
    mediaPlayerVersion?: string
    /**
     * A unique identifier for the device playing this track
     * */
    deviceId?: string
    /** The ID/Key for individual sessions on a device/platform */
    sessionId?: string

    nowPlaying?: boolean

    scrobbleTsSOC?: ScrobbleTsSOC

    comment?: string

    //lifecycle: PlayLifecycle<D>
    lifecycleInputs?: LifecycleInput[]

    //[key: string]: any
}

export interface LifecycleInput {
    type: string, input: (object | string)
}

export type ErrorLike = Error | ErrorObject;

/** scrobble action plus the match result before scrobbling */
export interface ScrobbleResult<D extends DateLike = Dayjs> {
    match?: PlayMatchResult<D>
    payload?: ScrobblePayload
    warnings?: string[]
    error?: Error | ErrorObject
    response?: ScrobbleResponse
    mergedScrobble?: AmbPlayObjectMinimal<D>
    createdAt?: D
}

export interface PlayLifecycle<D extends DateLike = Dayjs> {
    input?: object
    original?: PlayObjectMinimal<D>
    steps: LifecycleStep[]
    scrobble?: ScrobbleResult<D>
}

export interface LifecycleStep {
    stageName: string
    stageType: string
    hook: TransformHook
    source: string
    cached?: boolean
    returnPartial?: boolean
    flowResult?: FlowControlTerm
    flowReason?: string
    flowKnownState?: 'skip' | 'prereq'
    error?: ErrorLike
    patch?: Changeset
    inputs?: LifecycleInput[]
    createdAt: string
}

export type ScrobblePayload = object | string;
export type ScrobbleResponse = object | string;

export interface ScrobbleActionResult<D extends DateLike = Dayjs> {
    payload: ScrobblePayload, 
    response?: ScrobbleResponse, 
    mergedScrobble?: AmbPlayObject<D>
    warnings?: string[]
    createdAt: string
}

export interface PlayMatchResult<D extends DateLike = Dayjs> {
    match: boolean
    score: number
    breakdowns: string[]
    reason?: string
    closestMatchedPlay?: AmbPlayObjectMinimal<D>
    transformedPlay?: PlayObjectMinimal
    summary?: string
    createdAt: string
}

export type ScrobbleTsSOC = 1 | 2;

export const SCROBBLE_TS_SOC_START: ScrobbleTsSOC = 1;
export const SCROBBLE_TS_SOC_END: ScrobbleTsSOC = 2;

export type DateLike = Dayjs | string

export interface PlayOriginal<D extends DateLike = Dayjs> {
    data?: object
    play?: PlayObjectMinimal<D>
}

export interface AmbPlayObject<D extends DateLike = Dayjs, T = {}> {
    id?: number
    uid?: string
    data: PlayData<D>,
    meta: PlayMeta<D,T>
    original?: PlayOriginal<D>
    scrobble?: ScrobbleResult<D>
    lifecycle?: LifecycleStep[]
}

export type AmbPlayObjectMinimal<D extends DateLike = Dayjs, T = {}> = Pick<AmbPlayObject<D,T>, RequiredKeys<AmbPlayObject<D>>> & Pick<AmbPlayObject<D,T>, 'id' | 'uid'>;

export const isPlayObject = (obj: object): obj is PlayObject => {
   return obj !== undefined && obj !== null &&  'data' in obj && typeof obj.data === 'object' && 'meta' in obj && typeof obj.meta === 'object';
}

export type PlayObject<T = {}> = AmbPlayObject<Dayjs,T>;
export type PlayObjectMinimal<D extends DateLike = Dayjs, T = {}> = AmbPlayObjectMinimal<D,T>;
export interface PlayActivity {
  play: JsonPlayObject
  status: string
  error?: ErrorLike
}
export type JsonPlayObject = AmbPlayObject<string>;

export interface ObjectPlayData extends PlayData {
    playDate?: Dayjs
    playDateCompleted?: Dayjs
}

export interface LogOutputConfig {
    level: LogLevel,
    sort: string,
    limit: number
}

export interface SourcePlayerObj<D extends DateLike = Dayjs> {
    platformId: PlayPlatformIdStr,
    play?: AmbPlayObject<D>,
    playFirstSeenAt?: string,
    playLastUpdatedAt?: string,
    playerLastUpdatedAt: string
    createdAt?: number
    position?: Second
    listenedDuration: Second
    nowPlayingMode?: boolean
    status: {
        reported: string
        calculated: string
        stale: boolean
        orphaned: boolean
    }
}

export type SourcePlayerJson = SourcePlayerObj<string>;

export interface SourceScrobble<PlayType> {
    source: string
    play: PlayType
}

export interface QueuedScrobble<PlayType> extends SourceScrobble<PlayType> {
    id: string
}

export type NowPlayingUpdateThreshold = (play?: PlayObject) => number;

export interface DeadLetterScrobble<PlayType, RetryType = Dayjs> extends QueuedScrobble<PlayType> {
    id: string
    retries: number
    lastRetry?: RetryType
    error: string
    status: 'queued' | 'failed'
}

export type Second = number;
export type Millisecond = number;

export type TemporalAccuracy = 1 | 2 | 3 | 4 | 99;

/** Timestamp diffs are close to exact (less than or equal to 1 second difference) */
export const TA_EXACT: TemporalAccuracy = 1;
/** Timestamp diffs are within source reporting granularity margin-of-error (see lowGranularitySources):
 * normal granularity is 10 seconds
 * low granularity (subsonic usually) is 60 seconds
 */
export const TA_CLOSE: TemporalAccuracy = 2;
/** Timestamp diffs are not CLOSE but Scrobble A's timestamp +/- duration is within fuzzyDiffThreshold seconds of Scrobble B's timestamp */
export const TA_FUZZY: TemporalAccuracy = 3;
/** Timestamp diffs are not FUZZY and Scrobble B's timestamp is within potential full play of Scrobble A (timestamp +/- duration) */
export const TA_DURING: TemporalAccuracy = 4;
/** No correlation between timestamps */
export const TA_NONE: TemporalAccuracy = 99;

export type AcceptableTemporaryAccuracy = TemporalAccuracy[]

export const TA_DEFAULT_ACCURACY: AcceptableTemporaryAccuracy = [TA_EXACT, TA_CLOSE];

export type TemporalDuringReference = 'range' | 'duration' | 'listenedFor';

export type AcceptableTemporalDuringReference = TemporalDuringReference[];

export interface TemporalPlayComparison {
    match: TemporalAccuracy
    date?: {
        threshold: number
        diff: number
        fuzzyDurationDiff?: number
        fuzzyListenedDiff?: number
        fuzzyDiffThreshold?: number
    }
    duringReferences: AcceptableTemporalDuringReference
    range?: {
        timestamps: [Dayjs, Dayjs]
        type: TemporalDuringReference
    } | { type: 'none' }
}

export type SOURCE_SOT_TYPES = 'player' | 'history';
export const SOURCE_SOT = {
    PLAYER : 'player' as SOURCE_SOT_TYPES,
    HISTORY: 'history' as SOURCE_SOT_TYPES
}
export const sourceSotTypes: SOURCE_SOT_TYPES[] = ['player','history'];

export interface LeveledLogData extends LogDataPretty {
    levelLabel: string
}

export interface URLData {
    url: URL
    normal: string
    port: number
}

export type Joiner = ',' | '&' | '/' | '\\' | string;
export const JOINERS: Joiner[] = [',','/','\\'];

export type FinalJoiners = '&';
export const JOINERS_FINAL: FinalJoiners[] = ['&'];

export type Feat = 'ft' | 'feat' | 'vs' | 'ft.' | 'feat.' | 'vs.' | 'featuring'
export const FEAT: Feat[] = ['ft','feat','vs','ft.','feat.','vs.','featuring'];

export interface TransformOptions {
        failOnFetch?: boolean;
        throwOnFailure?: boolean | ('artists' | 'title' | 'albumArtists' | 'album' | 'duration' | 'meta' | 'art')[];
        ttl?: string
}
export interface TransformerCommonConfig<T = Record<string, any>, Y = Record<string, any>> {
    defaults?: T;
    data?: Y
    type: string;
    name?: string;
    options?: TransformOptions
}

export interface TransformerCommon<T = Record<string, any>, Y = Record<string, any>> extends TransformerCommonConfig<T,Y> {
    name: string
}

export type MissingMbidType = 'artists' | 'title' | 'album' | 'duration';
export const DEFAULT_MISSING_TYPES: MissingMbidType[] = ['artists','title','album', 'duration'];
export const DEFAULT_MISSING_MBIDS_TYPES: MissingMbidType[] = ['artists','title','album'];

export type MBReleaseStatus = 'official' | 'promotion' | 'bootleg' | 'pseudo-release' | 'withdrawn' | 'expunged' | 'cancelled';
export const MB_RELEASE_STATUSES: MBReleaseStatus[] = ['official','promotion','bootleg','pseudo-release','withdrawn','expunged' ,'cancelled'];
export const isMBReleaseStatus = (str: string): str is MBReleaseStatus => {
    return MB_RELEASE_STATUSES.includes(str as MBReleaseStatus);
}
export const asMBReleaseStatus = (str: string): MBReleaseStatus => {
    const clean = str.toLocaleLowerCase();
    if(isMBReleaseStatus(clean)) {
        return clean;
    } else {
        throw new Error(`Release Status is not valid: ${str}`);
    }
}

export type MBReleaseGroupPrimaryType = 'album' | 'single' | 'ep' | 'broadcast' | 'other';
export const MB_RELEASE_GROUP_PRIMARY_TYPES: MBReleaseGroupPrimaryType[] = ['album','single','ep','broadcast','other'];
export const isMBReleasePrimaryGroupType = (str: string): str is MBReleaseGroupPrimaryType => {
    return MB_RELEASE_GROUP_PRIMARY_TYPES.includes(str as MBReleaseGroupPrimaryType);
}
export const asMBReleasePrimaryGroupType = (str: string): MBReleaseGroupPrimaryType => {
    const clean = str.toLocaleLowerCase();
    if(isMBReleasePrimaryGroupType(clean)) {
        return clean;
    } else {
        throw new Error(`Primary Release Group is not valid: ${str}`);
    }
}

export type MBReleaseGroupSecondaryType = 'compilation' | 'soundtrack' | 'live' | 'remix';
export const MB_RELEASE_GROUP_SECONDARY_TYPES: MBReleaseGroupSecondaryType[] = ['compilation','soundtrack','live','remix'];
export const isMBReleaseSecondaryGroupType = (str: string): str is MBReleaseGroupSecondaryType => {
    return MB_RELEASE_GROUP_SECONDARY_TYPES.includes(str as MBReleaseGroupSecondaryType);
}
export const asMBReleaseSecondaryGroupType = (str: string): MBReleaseGroupSecondaryType => {
    const clean = str.toLocaleLowerCase();
    if(isMBReleaseSecondaryGroupType(clean)) {
        return clean;
    } else {
        throw new Error(`Secondary Release Group is not valid: ${str}`);
    }
}

export interface TransformResult {
    type: string,
    name: string,
    play: PlayData
}

export const KNOWN_MEDIA_PROVIDER_URLS = [
'spotify.com',
// spotify cdn
'scdn.co',
'bandcamp.com',
'youtube.com',
'deezer.com',
'tidal.com',
'apple.com',
'archive.org',
'coverartarchive.org',
'soundcloud.com',
'jamendo.com',
'play.google.com',
'listenbrainz.org',
'musicbrainz.org'
];

/** Number of SECONDS since 1970 */
export type UnixTimestamp = number;

export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const SHORT_CALENDAR_NOTZ_FORMAT = 'MMM D HH:mm:ss';
export const SHORT_TODAY_NOTZ_FORMAT = 'HH:mm:ss';
export interface numberFormatOptions {
    toFixed: number;
    defaultVal?: any;
    prefix?: string;
    suffix?: string;
    round?: {
        type?: string;
        enable: boolean;
        indicate?: boolean;
    };
}
/** Only checks for DateT since we can reasonbly sure if this exists its a date we can parse with dayjs
 * 
 * It needs to be cheap since we mostly use this when walking play objects to transform strings back to dayjs and there may be many strings to check
 */
export const REGEX_ISO8601_LOOSE = new RegExp(/\d{4}-[01]\d-[0-3]\dT/);
/** A string we previously marshalled has a wellknown prefix and only check for DateT since we can reasonbly sure if this exists its a date we can parse with dayjs
 */
export const REGEX_ISO8601_WELLKNOWN = new RegExp(/dayjs-(\d{4}-[01]\d-[0-3]\dT.*)/);

export const CLIENT_INGRESS_QUEUE: QueueName = 'ingress';
export const CLIENT_DEAD_QUEUE: QueueName = 'dead';
export type QueueName = 'ingress' | 'dead';
export const QUEUE_NAMES = [CLIENT_INGRESS_QUEUE, CLIENT_DEAD_QUEUE];

/**
 * Useful TS type-only utility for testing type equality
 * 
 * Usage: type EQ = TypesAreEqual<any[], [number][], "same", "different">; // "different"
 * 
 * @see https://stackoverflow.com/a/53808212/1469797
 */
export type TypesAreEqual<T, U, Y=unknown, N=never> =
  (<G>() => G extends T ? 1 : 2) extends
  (<G>() => G extends U ? 1 : 2) ? Y : N;

export type MBID = `${string}-${string}-${string}-${string}-${string}`

// ['queued','discovered','discarded','scrobbled','failed','duped']
export type PlayStateCommon = 'queued' |'discarded' | 'failed';
export const PLAY_STATE_COMMON: PlayStateCommon[] = ['queued', 'discarded', 'failed'];
export type PlaySourceState = PlayStateCommon | 'discovered';
export const PLAY_SOURCE_STATE: PlaySourceState[] = [...PLAY_STATE_COMMON, 'discovered'];
export type PlayClientState = PlayStateCommon | 'duped' | 'scrobbled';
export const PLAY_CLIENT_STATE = [...PLAY_STATE_COMMON, 'duped', 'scrobbled'];
export type PlayState = PlaySourceState | PlayClientState;
export const PLAY_STATES = Array.from(new Set([...PLAY_CLIENT_STATE, ...PLAY_SOURCE_STATE]));
export const isPlayState = (val: string): val is PlayState => PLAY_STATES.includes(val);


export type QueueStatus = 'queued' | 'completed' | 'failed';
export const QUEUE_STATUS_QUEUED: QueueStatus = 'queued';
export const QUEUE_STATUS_COMPLETED: QueueStatus = 'completed';
export const QUEUE_STATUS_FAILED: QueueStatus = 'failed';
export const QUEUE_STATUSES: QueueStatus[] = [QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED, QUEUE_STATUS_QUEUED];

/**
 * @see https://github.com/ts-essentials/ts-essentials/issues/339#issuecomment-4681920369 */
export type Replace<Type, Keys extends keyof Type, TReplace> = StrictOmit<Type, Keys> & Record<Keys, TReplace>

type Match<Value, ReplaceTuple extends readonly [any, any][], Acc = never> = ReplaceTuple extends readonly [[infer From, infer To], ...infer Rest extends readonly [any, any][]]
    ? [From] extends [Value]
        ? Match<Value, Rest, Acc | To>
        : Match<Value, Rest, Acc>
    : Acc;

/** 
 * @see https://github.com/ts-essentials/ts-essentials/issues/339#issuecomment-4770849507
 * @see https://tsplay.dev/w1rgkN
 */
export type DeepReplaceValue<Type, ReplaceTuple extends readonly [any, any][]> = Type extends {}
  ? {
        [Key in keyof Type]: Match<Type[Key], ReplaceTuple> extends infer Value
            ? [Value] extends [never]
                ? DeepReplaceValue<Type[Key], ReplaceTuple>
                : Value
            : never
        }
  : Type;

// example of usage
//
// type T1 = DeepReplaceValue<{
//     a: Date;
//     b: {
//         c: Date;
//         d: {
//             e: Date;
//         }
//     }
// }, [
//     [Date, string]
// ]>;

export const qsOptions: IParseBaseOptions = { 
    ignoreQueryPrefix: true, 
    depth: 5,
    parameterLimit: 20,
    arrayLimit: 20,
    plainObjects: true,
    allowPrototypes: false
}