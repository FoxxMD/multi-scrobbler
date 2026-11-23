import type { Dayjs } from "dayjs";
import type { EmittedMSEvent, LogEvent, SourceType } from "../../../core/Atomic.ts";
import type { PlayObject, SourcePlayerObj } from "../../../core/PlaySchema.ts";
import type { MSCoreEvents } from "../../../core/MSCoreEventMap.ts";
import type { WebhookPayload } from "./config/health/webhooks.ts";

export interface MSBackendEventMap extends Omit<MSCoreEvents, 'playerUpdate'> {
    notify: [EmittedMSEvent<WebhookPayload>]
    discoveredToScrobble: [EmittedMSEvent<{
        data: PlayObject | PlayObject[]
        options: {
        forceRefresh?: boolean, 
        [key: string]: any,
        discoverLocation?: 'backlog' | [key: string]
        checkTime: Dayjs
        scrobbleFrom: string
        scrobbleTo: string[]
        }
    }>]
    playerUpdate: [EmittedMSEvent<SourcePlayerObj<Dayjs> & { options: { scrobbleTo: string[], wasMonitored?: boolean } },{},SourceType>]
    statusChange: [EmittedMSEvent<{status: string}>]
    error: [unknown]
    configError: [Error | string]
    instantiateError: [Error]
    log: [LogEvent]
}