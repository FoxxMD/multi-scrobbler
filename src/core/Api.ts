import { ErrorLike, JsonPlayObject, PlayState } from "./Atomic.js"

export type PlayApiCommon = {
    uid: string
    componentId: number
    state: PlayState
    play: JsonPlayObject
    compacted: boolean
    playedAt: string
    seentAt: string
    updatedAt: string
    parentUid?: string
    // TODO add parent source type/name?
}

export type PlayInputApi = {
    id: number
    data: object
    play: JsonPlayObject
    createdAt: string
}

export type QueueStateApi = {
    id: number
    queueName: string
    queueState: string
    retries: number
    error?: ErrorLike
    createdAt: string
    updatedAt: string
}

export type PlayApiCommonDetailed = PlayApiCommon & {
    error: ErrorLike
    input: PlayInputApi
    queueStates: QueueStateApi[]
}