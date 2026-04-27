import assert from "node:assert";
import { PlayNew } from "./drizzleTypes.js";
import { PlayInputNew } from "./drizzleTypes.js";
import { QueueStateNew } from "./drizzleTypes.js";
import { ComponentNew } from "./drizzleTypes.js";
import { MarkOptional } from "ts-essentials";
import { ErrorLike, PlayObject } from "../../../../core/Atomic.js";
import dayjs, { Dayjs } from "dayjs";

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

export const generateInputEntity = (data: PlayInputNew): PlayInputNew => {
    return data;
}

export const generateQueueStateEntity = (data: QueueStateNew): QueueStateNew => {
    return data;
}