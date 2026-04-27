import assert from "node:assert";
import { PlayNew, PlaySelect } from "./drizzleTypes.js";
import { PlayInputNew } from "./drizzleTypes.js";
import { QueueStateNew } from "./drizzleTypes.js";
import { ComponentNew } from "./drizzleTypes.js";
import { MarkOptional } from "ts-essentials";
import { ErrorLike, PlayObject } from "../../../../core/Atomic.js";
import dayjs, { Dayjs } from "dayjs";
import { asPlay } from "../../../../core/PlayMarshalUtils.js";

export const generateComponentEntity = (data: MarkOptional<ComponentNew, 'uid'>): ComponentNew => {
    assert(data.name !== undefined, 'Must provide name');
    return {
        ...data,
        uid: data.uid ?? data.name
    };
}

export type PlayEntityOpts = Partial<Pick<PlayNew, 'seenAt' | 'playedAt' | 'uid' | 'state' | 'parentId' | 'componentId' | 'platformId'>> & { error?: ErrorLike };

export const generatePlayEntity = (play: PlayObject, opts: PlayEntityOpts = {}): PlayNew => {
    const {
        seenAt = dayjs(),
        state = 'queued',
        playedAt = play.data.playDate,
        ...restOpts
    } = opts;
    return {
        play,
        state,
        playedAt,
        seenAt,
        ...restOpts
    }
}

export type PlayHydateOptions = 'asPlay' | 'id' | 'uid';

export const hydratePlaySelect = (select: PlaySelect, opts: PlayHydateOptions[]): PlayObject => {
    if(opts.length === 0) {
        return select.play;
    }

    let res = select.play;
    if(opts.includes('asPlay')) {
        res = asPlay(res);
    }
    if(opts.includes('uid')) {
        res.meta.dbUid = select.uid;
    }
    if(opts.includes('id')) {
        res.meta.dbId = select.id;
    }
    return res;
}

export const generateInputEntity = (data: PlayInputNew): PlayInputNew => {
    return data;
}

export const generateQueueStateEntity = (data: QueueStateNew): QueueStateNew => {
    return data;
}