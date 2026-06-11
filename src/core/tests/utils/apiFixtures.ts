import { faker } from "@faker-js/faker";
import { ComponentClientApi, ComponentClientApiJson, ComponentCommonApi, ComponentCommonApiJson, ComponentSourceApi, ComponentSourceApiJson, PlayApiCommon, PlayApiCommonDetailed, PlayInputApi, QueueStateApi } from "../../Api.js";
import { CLIENT_INGRESS_QUEUE, JsonPlayObject, PlayObject, PlayState, QUEUE_STATUSES, SOURCE_SOT, sourceSotTypes } from "../../Atomic.js";
import { generatePlay } from "../../PlayTestUtils.js";
import { generatePlayInput, randomPlayState } from "./fixtures.js";
import { asJsonPlayObject } from "../../PlayMarshalUtils.js";
import { generatePlayUid } from "../../StringUtils.js";
import dayjs from "dayjs";
import { ErrorLike } from "serialize-error";
import { nanoid } from "nanoid";
import { isSourceType, SourceType, sourceTypes } from "../../../backend/common/infrastructure/config/source/sources.js";
import { ClientType, clientTypes } from "../../../backend/common/infrastructure/config/client/clients.js";
import { ComponentSelect } from "../../../backend/common/database/drizzle/drizzleTypes.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";

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

const statusSamples = ['Sleeping 💤', 'Processing Queue', '⚠️ Authentication Failed', 'Updating Now Playing', 'Monitoring Players', '⚠️  Upstream error'];

export const generateComponentCommonApiJson = (data: Partial<ComponentCommonApi> = {}): ComponentCommonApiJson => {
    const {
        type = faker.helpers.arrayElement([...sourceTypes, ...clientTypes]),
        createdAt = dayjs(),
        lastActiveAt = dayjs(),
        lastReadyAt = dayjs(),
        state = faker.helpers.arrayElement(['Idle','polling','running','error','awaiting data','stopped']),
        ...rest
    } = data;


    let mode: ComponentSelect['mode'] = data.mode;
    if(mode === undefined) {
        if(isSourceType(type)) {
            mode = 'source';
        } else {
            mode = faker.helpers.arrayElement(['source', 'client'])
        }
    }

    return {
        id: faker.number.int({min: 1, max: 100}),
        uid: generatePlayUid(),
        name: `${faker.word.adjective()} ${faker.word.noun()}`,
        createdAt: createdAt.toISOString(),
        lastActiveAt: lastActiveAt.toISOString(),
        lastReadyAt: lastReadyAt.toISOString(),
        type,
        mode,
        countLive: faker.number.int({min: 0, max: 2000}),
        countNonLive: 0,
        state,
        status: faker.helpers.arrayElement(statusSamples),
        ...rest
    }
}

export const generateSourceApiJson = (data: Partial<ComponentSourceApi> = {}): ComponentSourceApiJson => {
    const {
        mode,
        type = faker.helpers.arrayElement(sourceTypes),
        ...rest
    } = data;
    const common = generateComponentCommonApiJson({
        mode: 'source',
        type,
        ...rest
    });
    const {
        sot = faker.helpers.arrayElement(sourceSotTypes),
        supportsUpstreamRecentlyPlayed = faker.datatype.boolean(),
        supportsManualListening = faker.datatype.boolean({probability: 0.1}),
        manualListening = faker.datatype.boolean({probability: 0.1}),
        systemListeningBehavior = true,
        tracksDiscovered = faker.number.int({min: 1, max: 2000}),
        players = {}
    } = data;
    return {
        ...common,
        sot,
        supportsManualListening,
        supportsUpstreamRecentlyPlayed,
        manualListening,
        systemListeningBehavior,
        tracksDiscovered,
        players
    }
}

export const generateClientApiJson = (data: Partial<ComponentClientApi> = {}): ComponentClientApiJson => {
    const {
        mode,
        type = faker.helpers.arrayElement(clientTypes),
        ...rest
    } = data;
    const common = generateComponentCommonApiJson({
        mode: 'client',
        type,
        ...rest
    });
    const {
        queued = faker.number.int({min: 1, max: 2000}),
        deadLetterScrobbles = faker.number.int({min: 1, max: 2000}),
        deadLetterScrobblesTotal = faker.number.int({min: deadLetterScrobbles, max: 2000})
    } = data;
    return {
        ...common,
        queued,
        deadLetterScrobbles,
        deadLetterScrobblesTotal,
    }
}

export const generateComponentApiJson = (data: Partial<ComponentCommonApi> = {}): ComponentClientApiJson | ComponentSourceApiJson => {
    const {
        mode: modeData,
        type: typeData
    } = data;

    let mode: ComponentCommonApi['mode'],
    type: ComponentCommonApi['type'];

    if(modeData === undefined && typeData === undefined) {
        mode = faker.helpers.arrayElement(['source', 'client']);
        type = faker.helpers.arrayElement(mode === 'source' ? sourceTypes : clientTypes)
    } else if(modeData !== undefined && typeData === undefined) {
        mode = modeData;
        type = faker.helpers.arrayElement(mode === 'source' ? sourceTypes : clientTypes)
    } else if(typeData !== undefined) {
        type = typeData;
        mode = isClientType(type) ? 'client' : 'source';
    }

    if(mode === 'source') {
        return generateSourceApiJson({mode, type, ...data});
    }
    return generateClientApiJson({mode, type, ...data});
}