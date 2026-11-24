import type { Dayjs } from "dayjs";
import type { Changeset } from "json-diff-ts";
import * as z from "zod";
import { PLAY_STATES, parseRecordSchema, queueContextSchema, QUEUE_STATUSES, type DateLike, type ErrorLike, type LifecycleStep, type PlayState, type QueueStatus } from "./Atomic.ts";
import { playMatchResultSchema, playObjectSchema, scrobbleResultSchema, zDayjs, type PlayMatchResult, type ScrobbleResult } from "./PlaySchema.ts";

export type PlayEventType = 'transform' | 'queueStateChange' | 'playStateChange' | 'dupeCheck' | 'scrobbleResult' | 'updatePlay' | 'parse';
export const PLAY_EVENT_TYPE = {
    transform: 'transform',
    updatePlay: 'updatePlay',
    queueStateChange: 'queueStateChange',
    playStateChange: 'playStateChange',
    dupeCheck: 'dupeCheck',
    scrobbleResult: 'scrobbleResult',
    parse: 'parse'
} as const satisfies Record<string, PlayEventType>;

const errorLikeSchema = z.custom<ErrorLike>();

const basePlayEventSchema = z.object({
    id: z.int().optional(),
    playId: z.int(),
    error: errorLikeSchema.optional(),
    createdAt: zDayjs.optional(),
});

export const playEventQueueStateChangeDataSchema = z.object({
    queueName: z.string(),
    queueStatus: z.enum(QUEUE_STATUSES as [QueueStatus, ...QueueStatus[]]),
    context: queueContextSchema.nullable().optional(),
    retries: z.number().optional(),
    error: errorLikeSchema.nullable().optional(),
});

export const playEventPlayStateChangeDataSchema = z.object({
    state: z.enum(PLAY_STATES as [PlayState, ...PlayState[]]),
    error: errorLikeSchema.nullable().optional(),
    reason: z.string().optional(),
});

export const playEventUpdatePlayDataSchema = z.object({
    input: playObjectSchema.partial(),
    patch: z.custom<Changeset>(),
});

export const playEventSchema = z.discriminatedUnion('eventName', [
    basePlayEventSchema.extend({eventName: z.literal('transform'), data: z.custom<LifecycleStep>().array()}).meta({title: 'Transform Event'}),
    basePlayEventSchema.extend({eventName: z.literal('queueStateChange'), data: playEventQueueStateChangeDataSchema}).meta({title: 'Queue State Change Event'}),
    basePlayEventSchema.extend({eventName: z.literal('playStateChange'), data: playEventPlayStateChangeDataSchema}).meta({title: 'Play State Change Event'}),
    basePlayEventSchema.extend({eventName: z.literal('dupeCheck'), data: playMatchResultSchema}).meta({title: 'Dupe Check Event'}),
    basePlayEventSchema.extend({eventName: z.literal('scrobbleResult'), data: scrobbleResultSchema}).meta({title: 'Scrobble Result Event'}),
    basePlayEventSchema.extend({eventName: z.literal('updatePlay'), data: playEventUpdatePlayDataSchema}).meta({title: 'Update Play Event'}),
    basePlayEventSchema.extend({eventName: z.literal('parse'), data: parseRecordSchema}).meta({title: 'Parse Event'}),
]).meta({id: 'PlayEvent'});

/** Selects the JSON (string dates) or backend (Dayjs dates) side of playEventSchema. Distributes over DateLike. */
export type PlayEvent<D extends DateLike = Dayjs> = D extends string ? z.input<typeof playEventSchema> : z.output<typeof playEventSchema>;
type PlayEventOf<K extends PlayEventType, D extends DateLike> = Extract<PlayEvent<D>, {eventName: K}>;

export type PlayEventTranformData = LifecycleStep[];
export type PlayEventTransform<D extends DateLike = Dayjs> = PlayEventOf<'transform', D>;

export type PlayEventQueueStateChangeData = z.output<typeof playEventQueueStateChangeDataSchema>;
export type PlayEventQueueStateChange<D extends DateLike = Dayjs> = PlayEventOf<'queueStateChange', D>;

export type PlayEventPlayStateChangeData = z.output<typeof playEventPlayStateChangeDataSchema>;
export type PlayEventPlayStateChange<D extends DateLike = Dayjs> = PlayEventOf<'playStateChange', D>;

export type PlayEventDupeCheckData<D extends DateLike = Dayjs> = PlayMatchResult<D>;
export type PlayEventDupeCheck<D extends DateLike = Dayjs> = PlayEventOf<'dupeCheck', D>;

export type PlayEventScrobbleResultData<D extends DateLike = Dayjs> = ScrobbleResult<D>;
export type PlayEventScrobbleResult<D extends DateLike = Dayjs> = PlayEventOf<'scrobbleResult', D>;

export type PlayEventUpdatePlayData = z.output<typeof playEventUpdatePlayDataSchema>;
export type PlayEventUpdatePlay<D extends DateLike = Dayjs> = PlayEventOf<'updatePlay', D>;

export type PlayEventParseData = z.output<typeof parseRecordSchema>;
export type PlayEventParse<D extends DateLike = Dayjs> = PlayEventOf<'parse', D>;
