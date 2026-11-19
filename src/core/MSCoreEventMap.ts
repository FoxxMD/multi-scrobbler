import type { MarkRequired } from "ts-essentials"
import type { Dayjs } from "dayjs"
import type { PlayApiCommonDetailed, SseEventData } from "./Api.ts"
import type { EmittedMSEvent } from "./Atomic.ts"
import type { PlayObject, SourcePlayerObj } from "./PlaySchema.ts"

/**
 * Component events that are forwarded to SSE clients (/api/events), with the backend (Dayjs) shape of their data.
 *
 * What SSE clients receive is sseEventSchema
 * */
export interface MSCoreEvents {
    playInsert: [EmittedMSEvent<PlayApiCommonDetailed<Dayjs>>]
    playUpdate: [EmittedMSEvent<MarkRequired<Partial<PlayApiCommonDetailed<Dayjs>>, 'uid'>>]
    playDelete: [EmittedMSEvent<Pick<PlayApiCommonDetailed<Dayjs>, 'uid'> & Partial<Pick<PlayApiCommonDetailed<Dayjs>, 'componentId'>>>]
    playerUpdate: [EmittedMSEvent<SourcePlayerObj & {expiration?: Dayjs}>]
    playerDelete: [EmittedMSEvent<{platformId: string}>]
    /** already JSON, built from getApiData() */
    componentUpdate: [EmittedMSEvent<SseEventData<'componentUpdate'>>]
    scrobble: [EmittedMSEvent<{play: PlayObject}>]
    discovered: [EmittedMSEvent<{play: PlayObject}>]
    playQueued: [EmittedMSEvent<unknown>]
    playDequeued: [EmittedMSEvent<unknown>]
    deadLetter: [EmittedMSEvent<unknown>]
    deadLetterRemoved: [EmittedMSEvent<unknown>]
    deadQueued: [EmittedMSEvent<unknown>]
    deadLetterDequeued: [EmittedMSEvent<unknown>]
}
