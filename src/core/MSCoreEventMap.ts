import type { MarkRequired } from "ts-essentials"
import type { Dayjs } from "dayjs"
import type { PlayApiCommonDetailed } from "./Api.ts"
import type { EmittedMSEvent } from "./Atomic.ts"
import type { JsonPlayObject, SourcePlayerObj } from "./PlaySchema.ts"

export interface MSCoreEvents {
    playInsert: [EmittedMSEvent<PlayApiCommonDetailed<Dayjs>>]
    playUpdate: [EmittedMSEvent<MarkRequired<Partial<PlayApiCommonDetailed<Dayjs>>, 'uid'>>]
    playDelete: [EmittedMSEvent<Pick<PlayApiCommonDetailed<Dayjs>, 'uid' | 'componentId'>>]
    playerUpdate: [EmittedMSEvent<SourcePlayerObj<string>>]
    playerDelete: [EmittedMSEvent<{platformId: string},{options: {scrobbleTo: string[]}}>]
    scrobble: [EmittedMSEvent<{play: JsonPlayObject}>]
    discovered: [EmittedMSEvent<{play: JsonPlayObject}>]
    statusChange: [EmittedMSEvent<{status: string}>]
    error: [unknown]
}