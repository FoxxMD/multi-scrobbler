import type { MarkRequired } from "ts-essentials"
import type { PlayApiCommonDetailed } from "./Api.ts"
import type { EmittedMSEvent, JsonPlayObject, SourcePlayerObj } from "./Atomic.ts"

export interface MSCoreEvents {
    playInsert: [EmittedMSEvent<PlayApiCommonDetailed>]
    playUpdate: [EmittedMSEvent<MarkRequired<Partial<PlayApiCommonDetailed>, 'uid'>>]
    playerUpdate: [EmittedMSEvent<SourcePlayerObj<string>>]
    playerDelete: [EmittedMSEvent<{platformId: string},{options: {scrobbleTo: string[]}}>]
    scrobble: [EmittedMSEvent<{play: JsonPlayObject}>]
    discovered: [EmittedMSEvent<{play: JsonPlayObject}>]
    statusChange: [EmittedMSEvent<{status: string}>]
    error: [unknown]
}