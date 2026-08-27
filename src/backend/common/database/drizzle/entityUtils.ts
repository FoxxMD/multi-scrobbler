import assert from "node:assert";
import type {PlayHistoricalNew, PlayHistoricalSelect, PlayNew, PlaySelect, PlaySelectWithQueueStates, QueueStateSelect} from "./drizzleTypes.ts";
import type {PlayInputNew} from "./drizzleTypes.ts";
import type {QueueStateNew} from "./drizzleTypes.ts";
import type {ComponentNew} from "./drizzleTypes.ts";
import type { MarkOptional, MarkRequired } from "ts-essentials";
import { DEAD_QUEUE, type DeadLetterScrobble, type ErrorLike, type LifecycleStep, type PlayObject } from "../../../../core/Atomic.ts";
import dayjs from "dayjs";
import { playContentBasicInvariantTransform, playMbidIdentifier } from "../../../utils/PlayComparisonUtils.ts";
import { hashObject } from "../../../utils/StringUtils.ts";
import { serializeError } from "serialize-error";
import { PLAY_EVENT_TYPE, type PlayEventDupeCheck, type PlayEventDupeCheckData, type PlayEventPlayStateChange, type PlayEventPlayStateChangeData, type PlayEventQueueStateChange, type PlayEventQueueStateChangeData, type PlayEventScrobbleResult, type PlayEventScrobbleResultData, type PlayEventTransform } from "../../../../core/PlayEvent.ts";

export const generateComponentEntity = (data: MarkOptional<ComponentNew, 'uid'>): ComponentNew => {
    assert(data.name !== undefined, 'Must provide name');
    return {
        ...data,
        uid: data.uid ?? data.name
    };
}

export type PlayEntityOpts = Partial<Pick<PlayNew, 'seenAt' | 'playedAt' | 'uid' | 'state' | 'parentId' | 'componentId'>> & { error?: ErrorLike };
export type PlayHistoricalEntityOpts = Partial<Pick<PlayHistoricalNew, 'seenAt' | 'playedAt' | 'uid' | 'componentId'>>;

export const generatePlayEntity = (play: PlayObject, opts: PlayEntityOpts = {}): PlayNew => {
    const {
        seenAt = dayjs(),
        state = 'queued',
        playedAt = play.data.playDate,
        ...restOpts
    } = opts;
    let playHash: string = undefined;
    try {
        playHash = hashObject(playContentBasicInvariantTransform(play).data);
    } catch (e) {
        // swallow
    }
    const data: PlayNew = {
        play,
        playHash,
        state,
        playedAt,
        seenAt: play.meta.seenAt ?? seenAt,
        ...restOpts
    };
    const mbidId = playMbidIdentifier(play);
    if(mbidId !== undefined) {
        data.mbidIdentifier = mbidId;
    }
    return data;
}

export type PlayHydateOptions = 'asPlay' | 'id' | 'uid';

export const hydratePlaySelect = <T extends PlaySelect | PlayHistoricalSelect>(select: T, opts: PlayHydateOptions[] = ['id','uid']): PlayObject => {
    if(opts.length === 0) {
        return select.play;
    }

    const res = select.play;
    // if(opts.includes('asPlay')) {
    //     res = asPlay(res);
    // }
    if(opts.includes('uid')) {
        res.uid = select.uid;
        //res.meta.dbUid = select.uid;
    }
    if(opts.includes('id')) {
        res.id = select.id;
        //res.meta.dbId = select.id;
    }
    return res;
}

export const playSelectToDeadScrobble = (select: PlaySelectWithQueueStates, serializedError: boolean = false): DeadLetterScrobble<PlayObject> => {
    const deadQueue = select.queueStates.find(x => x.queueName === DEAD_QUEUE);
    return {
        play: select.play,
        id: select.uid,
        source: select.play.meta.source,
        retries: deadQueue.retries,
        lastRetry: deadQueue.updatedAt,
        error: (serializedError ? serializeError(select.error) : select.error) as unknown as string,
        status: deadQueue.queueStatus as 'queued' | 'failed'
    }
}

export const generateInputEntity = (data: PlayInputNew): PlayInputNew => {
    const {
        playHash = hashObject(playContentBasicInvariantTransform(data.play).data)
    } = data;
    return {...data, playHash};
}

export const generateQueueStateEntity = (data: QueueStateNew): QueueStateNew => {
    return data;
}

export const queueStateToEventData = (qs: QueueStateSelect): PlayEventQueueStateChangeData => {
    const {
        queueName,
        queueStatus,
        error,
        retries
    } = qs;
    return {
        queueName,
        queueStatus,
        error,
        retries
    }
}

export const transformToPlayEvent = (lifecycle: LifecycleStep[]): Omit<PlayEventTransform, 'playId'> => ({
    eventName: PLAY_EVENT_TYPE.transform,
    createdAt: dayjs(lifecycle[0].createdAt),
    data: lifecycle
});

export const stateChangeToPlayEvent = (partial: PlayEventPlayStateChangeData): Omit<PlayEventPlayStateChange, 'playId'> => ({
    eventName: PLAY_EVENT_TYPE.playStateChange,
    createdAt: dayjs(),
    data: partial
})

export const queueStateToPlayEvent = (partial: MarkOptional<QueueStateSelect, 'context'>): Omit<PlayEventQueueStateChange, 'playId'> => ({
    eventName: PLAY_EVENT_TYPE.queueStateChange,
    createdAt: dayjs(),
    data: partial
});
export const queueCompletionStateToPlayEvent = (partial: MarkOptional<QueueStateSelect, 'context' | 'retries'>): Omit<PlayEventQueueStateChange, 'playId'> => {
    const {
        context,
        retries,
        ...rest
    } = partial;
    return {
        eventName: PLAY_EVENT_TYPE.queueStateChange,
        createdAt: dayjs(),
        data: rest
    }
}

export const dupeCheckToPlayEvent = (partial: MarkRequired<Partial<PlayEventDupeCheckData>, 'match'>): Omit<PlayEventDupeCheck, 'playId'> => {
    const {match, ...rest} = partial;
    const data: PlayEventDupeCheckData = {
        match,
        score: match ? 1 : 0,
        breakdowns: [],
        createdAt: dayjs().toISOString(),
        ...rest
    };
    return {
        eventName: PLAY_EVENT_TYPE.dupeCheck,
        createdAt: dayjs(),
        data
    }
}

export const scrobbleToPlayEvent = (data: PlayEventScrobbleResultData): Omit<PlayEventScrobbleResult, 'playId'> => ({
    eventName: PLAY_EVENT_TYPE.scrobbleResult,
    createdAt: data.createdAt ?? dayjs(),
    data
});

export const entityIsPlayEntity = (obj: object): obj is PlaySelectWithQueueStates => `play` in obj && typeof obj.play === 'object'
    && `componentId` in obj && typeof obj.componentId === 'number'