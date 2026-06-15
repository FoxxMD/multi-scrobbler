import { PickKeys, StrictOmit } from "ts-essentials"
import { ComponentMinimalSelect } from "../backend/common/database/drizzle/drizzleTypes.js"
import { ClientType } from "../backend/common/infrastructure/config/client/clients.js"
import { SourceType } from "../backend/common/infrastructure/config/source/sources.js"
import { ErrorLike, JsonPlayObject, PlayState, Replace, SOURCE_SOT_TYPES, SourcePlayerJson } from "./Atomic.js"
import { Dayjs } from "dayjs"

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
    queueState: string
    retries: number
    error?: ErrorLike
    createdAt: string
    updatedAt: string
}

export interface PlayApiCommonDetailed extends PlayApiCommon {
    error?: ErrorLike
    input?: PlayInputApi
    queueStates: QueueStateApi[]
}

export type ComponentCommonApi = {
    type: SourceType | ClientType
    name: string
    /** General state of the component like Idle, Stopped, Running, Error */
    state: string
    /** More specific, live activity state like "sleeping", "hydrating historical scrobbles", "processing dead scrobbles", etc... */
    status?: string
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
    deadLetterScrobbles: number
    deadLetterScrobblesTotal: number
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
    players: Record<string, SourcePlayerJson>
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
    from: 'source' | 'client'
    data: T
    event: string
}

export type MsSseEvent<T extends object = Record<string, any>> = {
    playerUpdate: MsSseEventPayload<SourcePlayerJson>
    discovered: MsSseEventPayload
    scrobbleQueued: MsSseEventPayload
    scrobbleDequeued: MsSseEventPayload
    client: T
}