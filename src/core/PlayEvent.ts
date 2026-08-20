import type { Dayjs } from "dayjs";
import type { DateLike, ErrorLike, LifecycleStep, PlayMatchResult, PlayState, QueueContext, QueueStatus, ScrobbleResult } from "./Atomic.ts";

export type PlayEventType = 'transform' | 'queueStateChange' | 'playStateChange' | 'dupeCheck' | 'scrobbleResult';
export const PLAY_EVENT_TYPE = {
    transform: 'transform',
    queueStateChange: 'queueStateChange',
    playStateChange: 'playStateChange',
    dupeCheck: 'dupeCheck',
    scrobbleResult: 'scrobbleResult'
} as const satisfies Record<string, PlayEventType>;

export interface BasePlayEvent<K extends PlayEventType, T, D extends DateLike = Dayjs> {
    id?: number
    playId: number
    eventName: K
    error?: ErrorLike
    createdAt?: D
    data: T
}

export type PlayEventTranformData = LifecycleStep[];
export type PlayEventTransform<D extends DateLike = Dayjs> = BasePlayEvent<'transform', PlayEventTranformData, D>;

export interface PlayEventQueueStateChangeData {
    queueName: string
    queueStatus: QueueStatus
    context?: QueueContext
    retries?: number
    error?: ErrorLike
}
export type PlayEventQueueStateChange<D extends DateLike = Dayjs> = BasePlayEvent<'queueStateChange', PlayEventQueueStateChangeData, D>;

export interface PlayEventPlayStateChangeData {
    state: PlayState
    error?: ErrorLike
    reason?: string
}
export type PlayEventPlayStateChange<D extends DateLike = Dayjs> = BasePlayEvent<'playStateChange', PlayEventPlayStateChangeData, D>;

export type PlayEventDupeCheckData<D extends DateLike = Dayjs> = PlayMatchResult<D>;
export type PlayEventDupeCheck<D extends DateLike = Dayjs> = BasePlayEvent<'dupeCheck', PlayEventDupeCheckData<D>, D>;

export type PlayEventScrobbleResultData<D extends DateLike = Dayjs> = ScrobbleResult<D>;
export type PlayEventScrobbleResult<D extends DateLike = Dayjs> = BasePlayEvent<'scrobbleResult', PlayEventScrobbleResultData<D>, D>;

export type PlayEvent<D extends DateLike = Dayjs> = PlayEventTransform<D>
    | PlayEventQueueStateChange<D>
    | PlayEventPlayStateChange<D>
    | PlayEventDupeCheck<D>
    | PlayEventScrobbleResult<D>;