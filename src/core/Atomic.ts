import { LogDataPretty, LogLevel } from "@foxxmd/logging";
import { Dayjs } from "dayjs";
import { ListenProgress } from "../backend/sources/PlayerState/ListenProgress.js";
import { AdditionalTrackInfoResponse } from "../backend/common/vendor/listenbrainz/interfaces.js";

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
    type: "maloja" | "lastfm" | "librefm" | "listenbrainz" | "koito" | "tealfm" | "rocksky";
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

export interface PlayProgressAmb {
    timestamp: string | Dayjs
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
    start: ListenProgress
    end: ListenProgress
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
    track?: string
    /**
     * 
     *  The "consolidated" album like -->  "The Wall" by "Pink Floyd" */
    releaseGroup?: string
    additionalInfo?: AdditionalTrackInfoResponse

    /** Position of track within Release */
    trackNumber?: number
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
    artists?: string[]
    albumArtists?: string[]
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

export interface PlayData extends TrackData {
    /**
     * The date the track was played at
     * */
    playDate?: Dayjs | string
    /** Number of seconds the track was listened to */
    listenedFor?: number
    listenRanges?: ListenRangeData[]
    playDateCompleted?: Dayjs | string
    repeat?: boolean
}

export interface PlayMeta {
    source?: string

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
    playerLastUpdatedAt: string
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
        throwOnFailure?: boolean | ('artists' | 'title' | 'albumArtists' | 'album' | 'duration' | 'meta')[];
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