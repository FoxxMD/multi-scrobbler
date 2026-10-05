import type { CompareOpKey, ComponentMinimalSelect } from "../backend/common/database/drizzle/drizzleTypes.ts"
import { mbidSchema, type Credit, type ClientType, type ComponentAuthType, type DeepReplaceValue, type MonitoringStatus, type QueueContext } from "./Atomic.ts"
import type { SourceType } from "./Atomic.ts"
import type { ComponentType, DateLike, ErrorLike, JsonPlayObject, PlayState, QueueName, SOURCE_SOT_TYPES, SourcePlayerJson } from "./Atomic.ts"
import type { Dayjs } from "dayjs"
import type { ErrorIsh } from "./ErrorUtils.ts"
import type { PlayEvent } from "./PlayEvent.ts"
import * as z from "zod"
import { mbMeta, spotifyMeta, withImage } from "./MusicMetadata.ts"
import { nameToCredit } from "./MusicMetadata.ts"

export interface PlayApiCommon {
    uid: string
    componentId: number
    state: PlayState
    play: JsonPlayObject
    compacted: boolean
    playedAt: string
    seenAt: string
    updatedAt: string
    parentUid?: string
    // TODO add parent source type/name?
}

export interface PlayInputApi {
    id: number
    data?: object
    play?: JsonPlayObject
    createdAt: string
}

export interface QueueStateApi {
    id: number
    queueName: string
    queueStatus: string
    retries: number
    error?: ErrorLike
    updatedAt: string
    createdAt: string
    context?: QueueContext
}

export interface PlayApiCommonDetailed extends PlayApiCommon {
    error?: ErrorIsh
    input?: PlayInputApi
    queueStates: QueueStateApi[]
    events: PlayEvent<string>[]
}

export type ComponentState = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const COMPONENT_STATE = {
    RUNNING: 1,
    IGNORED: 2,
    IDLE: 3,
    STOPPED: 4,
    INITIALIZING: 5,
    NOT_READY: 6,
    ERROR: 7,
} as const satisfies Record<string, ComponentState>;

export const componentStateToFriendly = (state: ComponentState) => {
    switch(state) {
        case 1:
            return 'Running';
        case 2:
            return 'Ignored';
        case 3:
            return 'Idle';
        case 4:
            return 'Stopped';
        case 5:
            return 'Initializing';
        case 6:
            return 'Not Ready';
        case 7:
            return 'Error';
    }
}

export type ComponentCommonApi = {
    type: SourceType | ClientType
    name: string
    /** General state of the component like Idle, Stopped, Running, Error */
    state: ComponentState
    /** More specific, live activity state like "sleeping", "hydrating historical scrobbles", "processing dead scrobbles", etc... */
    status?: string
    players: Record<string, SourcePlayerJson>
    errors?: ErrorIsh[]
    warnings?: ErrorIsh[]
    monitoringStatus?: MonitoringStatus
    deadLetterPlays: number
    deadLetterPlaysTotal: number
    queued: number
} & Omit<ComponentMinimalSelect, 'type'>

/** Maps Dayjs (including nullable/optional Dayjs) properties to string, preserving optionality */
// nullable Dayjs fields are emitted as undefined (key omitted) when missing, so allow undefined as well as null
type DayjsJsonVal<V> = Dayjs extends V ? Exclude<V, Dayjs> | string | (null extends V ? undefined : never) : V;
type DayjsToJson<T> = { [K in keyof T]: DayjsJsonVal<T[K]> };

export type ComponentCommonApiJson = DayjsToJson<ComponentCommonApi>;

export type ComponentHistoricalApi = {
    synced: boolean
    syncedReason: string | null | undefined
    syncError: ErrorIsh | null | undefined
    lastImport: Dayjs | undefined
    lastImportSuccess: Dayjs | undefined
}

export type ComponentDetailedApi = ComponentCommonApi & {
    hasAuth: boolean;
    hasAuthInteraction: boolean;
    authed: boolean
    authType: ComponentAuthType
    initialized: boolean
}

export type ComponentCientApiBase = {
    tracksScrobbled: number
    supportsNowPlaying: boolean
    players: Record<string, SourcePlayerJson & {expiration?: string}>
}

export type ComponentClientApi = ComponentDetailedApi & ComponentCientApiBase & Partial<ComponentHistoricalApi>;
export type ComponentClientApiJson = DayjsToJson<ComponentClientApi>;

export type ComponentSourceApiBase = {
    sot: SOURCE_SOT_TYPES
    supportsUpstreamRecentlyPlayed: boolean;
    tracksDiscovered: number;
    wakeAt?: string
    sleeping: boolean
}

export type ComponentSourceApi = ComponentDetailedApi & ComponentSourceApiBase & Partial<ComponentHistoricalApi>;
export type ComponentSourceApiJson = DayjsToJson<ComponentSourceApi>;

export type SubsonicSourceApiJson = ComponentSourceApiJson & { playbackReporting?: boolean }

export type ComponentsApiJson = ComponentSourceApiJson | ComponentClientApiJson;

export const isComponentSourceApiJson = (data: ComponentCommonApiJson): data is ComponentSourceApiJson => {
    return data.mode === 'source';
}
export const isComponentClientApiJson = (data: ComponentCommonApiJson): data is ComponentClientApiJson => {
    return data.mode === 'client';
}

export type MsSseEventPayload<T extends object = Record<string, any>> = {
    type: SourceType | ClientType
    name: string
    componentId: number
    from: ComponentType
    data: T
    event: string
}

export type MsSseEvent<T extends object = Record<string, any>> = {
    playerUpdate: MsSseEventPayload<SourcePlayerJson>
    discovered: MsSseEventPayload
    scrobbleQueued: MsSseEventPayload
    scrobbleDequeued: MsSseEventPayload
    client: T
    componentUpdate: MsSseEventPayload<ComponentCommonApiJson>
    playInsert: MsSseEventPayload<PlayApiCommonDetailed>
    playUpdate: MsSseEventPayload<Partial<PlayApiCommonDetailed>>
}

export type SortPlaysBy = 'played' | 'seen';
export interface SortPlaysByProps {
    sortBy: SortPlaysBy
}

export type PlayStateUI = PlayState | 'failed TBR';

export type QueryPlaysOptsJson = {
    sort?: "playedAt" | "seenAt";
    order?: "asc" | "desc";
    with?: ("input" | "parent" | "parent-input" | "queues")[];
    limit?: number;
    offset?: number;
    state?: ("queued" | "discovered" | "discarded" | "scrobbled" | "failed" | "duped")[];
    stateNot?: ("queued" | "discovered" | "discarded" | "scrobbled" | "failed" | "duped")[];
    componentId?: number;
    seenAt?: {
        type: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
        date: string;
    } | {
        type: "between";
        range: [string, string];
        inclusive?: boolean;
    };
    playedAt?: {
        type: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
        date: string;
    } | {
        type: "between";
        range: [string, string];
        inclusive?: boolean;
    };
queues?: {
        queueName: QueueName;
        queueStatus: ('queued' | 'failed' | 'completed')[] | ('queued' | 'failed' | 'completed');
    }[];
    uid?: string[];
    text?: string[];
}
export interface PaginatedQueryResponse {
    limit: number;
    offset: number;
    total?: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginatedQueryResponse;
}

export type CompareDateBetween<D extends DateLike = Dayjs> = {
    type: 'between';
    range: [D, D];
    inclusive?: boolean;
};

export type CompareDateSingle<D extends DateLike = Dayjs> = {
    type: CompareOpKey<D>;
    date: D;
};

export type CacheClearType = 'external-api' | 'transforms';

export const componentStateBodySchema = z.object({
    state: z.enum(["stop","start","restart","ignore","monitor"]),
    reason: z.string().optional()
});

export type ComponentStateBody = z.infer<typeof componentStateBodySchema>;

export const playStateBodySchema = z.object({
    state: z.enum(["discarded"]),
    reason: z.string().optional()
});

export type PlayStateBody = z.infer<typeof playStateBodySchema>;

export const metadataResultBaseSchema = z.object({
        id: z.string(),
        name: z.string()
});
export type MetadataResultBase = z.infer<typeof metadataResultBaseSchema>;

export const metadataResultServiceScoreSchema = z.object({
    service: z.string(),
    score: z.int().nonnegative().optional(),
})
export type MetadataResultServiceScore = z.infer<typeof metadataResultServiceScoreSchema>;

export const metadataResultImageSchema = z.object({
    image: z.string().optional()
})
export type MetadataResultImage = z.infer<typeof metadataResultImageSchema>;

export const artistSearchResultSchema = z.object({
    mbid: mbidSchema.optional(),
    spotifyId: z.string().optional(),
    ...metadataResultServiceScoreSchema.shape,
    ...metadataResultBaseSchema.shape,
    ...metadataResultImageSchema.shape,
});
export type ArtistSearchResult = z.infer<typeof artistSearchResultSchema>;

export const artistSearchResultResponseSchema = z.object({
    data: artistSearchResultSchema.array()
});
export type ArtistSearchResultResponse = z.infer<typeof artistSearchResultResponseSchema>;

export const albumSearchResultSchema = z.object({
    ...metadataResultServiceScoreSchema.shape,
    ...metadataResultBaseSchema.shape,
    ...metadataResultImageSchema.shape,
    mbidRelease: z.string().optional(),
    mbidReleaseGroup: z.string().optional(),
    spotifyId: z.string().optional(),
    type: z.string().optional(),
    artists: artistSearchResultSchema.array().optional(),
});
export type AlbumSearchResult = z.infer<typeof albumSearchResultSchema>;

export const albumSearchResultResponseSchema = z.object({
    data: albumSearchResultSchema.array()
});
export type AlbumSearchResultResponse = z.infer<typeof albumSearchResultResponseSchema>;

export const trackSearchResultSchema = z.object({
    ...metadataResultServiceScoreSchema.shape,
    ...metadataResultBaseSchema.shape,
    ...metadataResultImageSchema.shape,
    mbidRecording: z.string().optional(),
    mbidTrack: z.string().optional(),
    spotifyId: z.string().optional(),
    artists: artistSearchResultSchema.array().optional(),
    album: albumSearchResultSchema.optional(),
    albumCount: z.int().positive().optional()
});
export type TrackSearchResult = z.infer<typeof trackSearchResultSchema>;

export const trackSearchResultResponseSchema = z.object({
    data: trackSearchResultSchema.array()
});
export type TrackSearchResultResponse = z.infer<typeof trackSearchResultResponseSchema>;

export const artistSearchResultToCredit = (val: Pick<ArtistSearchResult, 'name' | 'mbid' | 'spotifyId' | 'image'>): Credit =>
    withImage(nameToCredit(val.name, mbMeta(val.mbid, 'artist'), spotifyMeta(val.spotifyId, 'artist')), val.image);

export const albumSearchResultToCredit = (val: Pick<AlbumSearchResult, 'name' | 'mbidRelease' | 'mbidReleaseGroup' | 'spotifyId' | 'image'>): Credit =>
    withImage(nameToCredit(val.name, mbMeta(val.mbidRelease, 'release'), mbMeta(val.mbidReleaseGroup, 'release-group'), spotifyMeta(val.spotifyId, 'album')), val.image);

export const trackSearchResultToCredit = (val: Pick<TrackSearchResult, 'name' | 'mbidTrack' | 'mbidRecording' | 'spotifyId' | 'image'>): Credit =>
    withImage(nameToCredit(val.name, mbMeta(val.mbidTrack, 'track'), mbMeta(val.mbidRecording, 'recording'), spotifyMeta(val.spotifyId, 'track')), val.image);
