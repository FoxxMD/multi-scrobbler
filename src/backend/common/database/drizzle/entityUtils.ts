import assert from "node:assert";
import { PlayNew, PlaySelect, PlaySelectWithQueueStates } from "./drizzleTypes.js";
import { PlayInputNew } from "./drizzleTypes.js";
import { QueueStateNew } from "./drizzleTypes.js";
import { ComponentNew } from "./drizzleTypes.js";
import { MarkOptional, MarkRequired } from "ts-essentials";
import { CLIENT_DEAD_QUEUE, DeadLetterScrobble, ErrorLike, PlayObject } from "../../../../core/Atomic.js";
import dayjs, { Dayjs } from "dayjs";
import { asPlay } from "../../../../core/PlayMarshalUtils.js";
import { playContentBasicInvariantTransform, playMbidIdentifier } from "../../../utils/PlayComparisonUtils.js";
import { hashObject } from "../../../utils/StringUtils.js";
import { serializeError } from "serialize-error";

export const generateComponentEntity = (data: MarkOptional<ComponentNew, 'uid'>): ComponentNew => {
    assert(data.name !== undefined, 'Must provide name');
    return {
        ...data,
        uid: data.uid ?? data.name
    };
}

export type PlayEntityOpts = Partial<Pick<PlayNew, 'seenAt' | 'playedAt' | 'uid' | 'state' | 'parentId' | 'componentId'>> & { error?: ErrorLike };

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

export const hydratePlaySelect = (select: PlaySelect, opts: PlayHydateOptions[] = ['id','uid']): PlayObject => {
    if(opts.length === 0) {
        return select.play;
    }

    let res = select.play;
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
    const deadQueue = select.queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE);
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
    return data;
}

export const generateQueueStateEntity = (data: QueueStateNew): QueueStateNew => {
    return data;
}