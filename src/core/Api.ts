import { ErrorLike, JsonPlayObject, PlayState } from "./Atomic.js"

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