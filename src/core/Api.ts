import type { PickKeys } from "ts-essentials"
import type { CompareOpKey, ComponentMinimalSelect } from "../backend/common/database/drizzle/drizzleTypes.ts"
import type { ClientType } from "./Atomic.ts"
import type { SourceType } from "./Atomic.ts"
import type { ComponentType, DateLike, ErrorLike, JsonPlayObject, PlayState, QueueName, Replace, SOURCE_SOT_TYPES, SourcePlayerJson } from "./Atomic.ts"
import type { Dayjs } from "dayjs"
import type { ErrorIsh } from "./ErrorUtils.ts"

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
}

export interface PlayApiCommonDetailed extends PlayApiCommon {
    error?: ErrorIsh
    input?: PlayInputApi
    queueStates: QueueStateApi[]
}

export type ComponentState = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const COMPONENT_STATE = {
    RUNNING: 1,
    MUTED: 2,
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
    error?: ErrorIsh
    warning?: ErrorIsh
} & Omit<ComponentMinimalSelect, 'type'>

export type ComponentCommonApiJson = Replace<ComponentCommonApi, PickKeys<ComponentCommonApi, Dayjs>, string>;

export type ComponentDetailedApi = ComponentCommonApi & {
    hasAuth: boolean;
    hasAuthInteraction: boolean;
    authed: boolean
    initialized: boolean
}

export type ComponentCientApiBase = {
    queued: number
    tracksScrobbled: number
    deadLetterScrobbles: number
    deadLetterScrobblesTotal: number
    supportsNowPlaying: boolean
    players: Record<string, SourcePlayerJson & {expiration?: string}>
}

export type ComponentClientApi = ComponentCommonApi & ComponentCientApiBase;
export type ComponentClientApiJson = Replace<ComponentClientApi, PickKeys<ComponentClientApi, Dayjs>, string>;

export type ComponentSourceApiBase = {
    sot: SOURCE_SOT_TYPES
    supportsUpstreamRecentlyPlayed: boolean;
    supportsManualListening: boolean;
    manualListening?: boolean
    systemListeningBehavior?: boolean
    tracksDiscovered: number;
    wakeAt?: string
    sleeping: boolean
}

export type ComponentSourceApi = ComponentCommonApi & ComponentSourceApiBase;
export type ComponentSourceApiJson = Replace<ComponentSourceApi, PickKeys<ComponentSourceApi, Dayjs>, string>;

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

export type PlayStateUI = PlayState | 'dead queued';

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

