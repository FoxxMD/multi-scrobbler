import { faker } from "@faker-js/faker";
import { PlayApiCommon, PlayApiCommonDetailed, PlayInputApi, QueueStateApi } from "../../Api.js";
import { CLIENT_INGRESS_QUEUE, JsonPlayObject, PlayObject, PlayState, QUEUE_STATUSES } from "../../Atomic.js";
import { generatePlay } from "../../PlayTestUtils.js";
import { generatePlayInput, randomPlayState } from "./fixtures.js";
import { asJsonPlayObject } from "../../PlayMarshalUtils.js";
import { generatePlayUid } from "../../StringUtils.js";
import dayjs from "dayjs";
import { ErrorLike } from "serialize-error";

export const generatePlayApiCommon = (commonData: Partial<PlayApiCommon> & {play?: JsonPlayObject | PlayObject } = {}, ...playOpts: Parameters<typeof generatePlay>): PlayApiCommon => {
    let play: JsonPlayObject | PlayObject;
    const {
        play: cPlay,
        ...rest
    } = commonData;
    if(cPlay !== undefined) {
        play = cPlay
    } else {
        play = generatePlay(...playOpts);
    }

    const {
        playedAt = typeof play.data.playDate === 'string' ? play.data.playDate : play.data.playDate.toISOString(),
        seenAt = playedAt,
        updatedAt = seenAt,
        compacted = false,
        state = randomPlayState(),
        componentId = faker.number.int({min: 1, max: 10}),
        uid = generatePlayUid()
    } = commonData;

    return {
        play: asJsonPlayObject(play),
        ...rest,
        playedAt,
        seenAt,
        updatedAt,
        compacted,
        state,
        componentId,
        uid
    }
}

export const generatePlayInputApi = (inputData: Partial<PlayInputApi> = {}, ...args: Parameters<typeof generatePlayInput>): PlayInputApi => {
    const res = generatePlayInput(...args);
    let createdAt: string = dayjs().toISOString();
    if(res.play?.data?.playDate !== undefined) {
        if(typeof res.play?.data?.playDate === 'string') {
            createdAt = res.play?.data?.playDate;
        } else {
            createdAt = res.play?.data?.playDate.toISOString();
        }
    }
    return {
        id: faker.number.int({min: 1, max: 100}),
        createdAt,
        data: res.data,
        play: res.play !== undefined ? asJsonPlayObject(res.play) : undefined,
        ...inputData,
    }
}

export const generateQueueStateApi = (data: Partial<QueueStateApi>): QueueStateApi => {
    const cAt = faker.date.recent().toISOString();
    return {
        id: faker.number.int({min: 1, max: 100}),
        queueName: CLIENT_INGRESS_QUEUE,
        queueState: faker.helpers.arrayElement(QUEUE_STATUSES),
        createdAt: cAt,
        updatedAt: cAt,
        retries: 0,
        ...data
    }
}

export const generatePlayApiCommonDetailed = (opts: {
    playOpts?: Parameters<typeof generatePlayApiCommon>,
    inputOpts?: Parameters<typeof generatePlayInputApi>,
    queueOpts?: Parameters<typeof generateQueueStateApi>
} = {}, error?: ErrorLike): PlayApiCommonDetailed => {
    const {
        playOpts = [],
        inputOpts = [],
        queueOpts = [],
    } =  opts;

    const playCommon = generatePlayApiCommon(...playOpts);
    const inputRes = generatePlayInputApi(...inputOpts);
    const queueRes = generateQueueStateApi(queueOpts[0]);

    return {
        ...playCommon,
        input: inputRes,
        queueStates: [queueRes],
        error
    }
}