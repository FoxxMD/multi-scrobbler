import { faker } from "@faker-js/faker";
import type {ComponentClientApi, ComponentClientApiJson, ComponentCommonApi, ComponentCommonApiJson, ComponentSourceApi, ComponentSourceApiJson, ComponentState, PlayApiCommon, PlayApiCommonDetailed, PlayInputApi, QueueStateApi} from "../../Api.ts";
import { CLIENT_INGRESS_QUEUE, type ComponentType, type JsonPlayObject, type PlayObject, QUEUE_STATUSES, type SourcePlayerJson, sourceSotTypes } from "../../Atomic.ts";
import { generatePlay, normalizePlays } from "./PlayTestUtils.ts";
import { generatePlayInput, generatePlayWithLifecycle, playWithLifecycleScrobble, randomPlayState } from "./fixtures.ts";
import { asJsonPlayObject } from "../../PlayMarshalUtils.ts";
import { generatePlayUid } from "../../StringUtils.ts";
import dayjs, { type Dayjs } from "dayjs";
import { isSourceType } from "../../Atomic.ts";
import { sourceTypes } from "../../Atomic.ts";
import { clientTypes } from "../../Atomic.ts";
import { isClientType } from '../../Atomic.ts';
import { CALCULATED_PLAYER_STATUSES } from '../../Atomic.ts';
import { REPORTED_PLAYER_STATUSES } from '../../Atomic.ts';
import { generateArray } from "../../DataUtils.ts";
import type {ErrorIsh} from "../../ErrorUtils.ts";

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
        updatedAt = dayjs().toISOString(),
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
        queueStatus: faker.helpers.arrayElement(QUEUE_STATUSES),
        updatedAt: cAt,
        retries: 0,
        createdAt: cAt,
        ...data
    }
}

export const generatePlayApiCommonDetailed = (opts: {
    playOpts?: Parameters<typeof generatePlayApiCommon>,
    inputOpts?: Parameters<typeof generatePlayInputApi>,
    queueOpts?: Parameters<typeof generateQueueStateApi>
} = {}, error?: ErrorIsh): PlayApiCommonDetailed => {
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
        state = faker.number.int({min: 1, max: 7}) as ComponentState,
        players = {},
        ...rest
    } = data;


    let mode: ComponentType = data.mode;
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
        players,
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
        players = (data.players ?? {}),
        sleeping = false,
    } = data;
    return {
        ...common,
        sot,
        supportsManualListening,
        supportsUpstreamRecentlyPlayed,
        manualListening,
        systemListeningBehavior,
        tracksDiscovered,
        players,
        sleeping
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
        deadLetterScrobblesTotal = faker.number.int({min: deadLetterScrobbles, max: 2000}),
        players = (data.players ?? {}),
    } = data;
    return {
        ...common,
        queued,
        tracksScrobbled: common.countLive,
        deadLetterScrobbles,
        deadLetterScrobblesTotal,
        players,
        supportsNowPlaying: Object.keys(players).length > 0
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

export const generateSourcePlayerJson = (data: Partial<SourcePlayerJson> = {}, opts: {art?: boolean} = {}): SourcePlayerJson => {
    const {
        platformId = `${faker.word.noun()}-${faker.word.adjective()}`,
        play = asJsonPlayObject(generatePlay()),
        position = play.meta.trackProgressPosition ?? faker.number.int({min: 0, max: play.data.duration}),
        listenedDuration = play.data.listenedFor ?? faker.number.int({min: 0, max: play.data.duration}),
        playFirstSeenAt = dayjs().subtract(30, 's').toISOString(),
        playLastUpdatedAt = dayjs().subtract(10, 's').toISOString(),
        playerLastUpdatedAt = dayjs().subtract(10, 's').toISOString(),
        createdAt = dayjs().unix(),
        status: {
            reported = REPORTED_PLAYER_STATUSES.playing,
            calculated = CALCULATED_PLAYER_STATUSES.playing,
            stale = false,
            orphaned = false
        } = {}
    } = data;

    if(opts.art) {
        play.meta = {
            ...(play.meta),
            art: {
                album: 'https://placehold.co/400',
                ...(play.meta?.art ?? {})
            }
        }
    }

    return {
        platformId,
        play,
        position,
        listenedDuration,
        playerLastUpdatedAt,
        playFirstSeenAt,
        playLastUpdatedAt,
        createdAt,
        status: {
            reported,
            calculated,
            stale,
            orphaned
        }
    }
}

const traceMessage = "[2026-06-16 13:02:42.674 -0400] \u001b[90mTRACE\u001b[39m  : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Scrobblers]\u001b[36m \u001b[90m[Koito - koito]\u001b[36m \u001b[90m[Now Playing]\u001b[36m Not updating, previous matches current update --BUT-- time since last update (194s) is less than max threshold 238.121s\u001b[39m";
const debugMessage = "[2026-06-16 13:03:20.150 -0400] \u001b[34mDEBUG\u001b[39m  : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Sources]\u001b[36m \u001b[90m[Spotify - default]\u001b[36m Temporarily decreasing polling interval to 1.00s due to Player c98a8fb80e-foxx-arch-SingleUser reporting track duration remaining (2.01s) less than normal interval (10.00s)\u001b[39m";
const verboseMessage = "[2026-06-16 13:03:23.568 -0400] \u001b[35mVERBOSE\u001b[39m: \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Sources]\u001b[36m \u001b[90m[Spotify - default]\u001b[36m \u001b[90m[Player c98a8fb80e-foxx-arch-SingleUser]\u001b[36m New Play: (2KcQh1rHrJ23eaxax1L1PG) Strutman Lane - One of a Kind\u001b[39m";
const infoMessage = "[2026-06-16 13:03:24.129 -0400] \u001b[32mINFO\u001b[39m   : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Scrobblers]\u001b[36m \u001b[90m[Koito - koito]\u001b[36m Scrobbled (New)     => (Spotify) Couch - Jessie @ 2026-06-16T13:03:23-04:00 (C)\u001b[39m";
const errorMessage = "[2026-06-16 10:41:13.948 -0400] \u001b[31mERROR\u001b[39m  : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Scrobblers]\u001b[36m \u001b[90m[Lastfm - mylfm]\u001b[36m Scrobble Error (New)\u001b[39m\n    playInfo: \"Alice Auer - Unknown @ 2026-06-16T10:06:07-04:00 (C)\"\n    payload: {\n      \"artist\": \"Alice Auer\",\n      \"track\": \"Unknown\",\n      \"album\": \"Unknown\",\n      \"timestamp\": 1781618767,\n      \"mbid\": \"9957324d-3c86-47cd-b844-0c92cf374ec1\",\n      \"duration\": 214\n    }";

const messages = [traceMessage, debugMessage, verboseMessage, infoMessage, errorMessage];

export const LOG_MESSAGE_FIXTURE = {
    trace: traceMessage,
    debug: debugMessage,
    verbose: verboseMessage,
    info: infoMessage,
    error: errorMessage,
    messages
}

export const logsApiResponse = () => {
    const time = dayjs().subtract(10, 'm').unix();
    return {data: messages.map((x, index) => ({line: x, time: time + index, levelLabel: 'debug', level: 'debug'})) }
}

export const generatePlayApiCommonDetailedList = async (opts: {endDate?: Dayjs, initialDate?: Dayjs} = {}) => {
      const queued = normalizePlays(generateArray(7, () => generatePlayWithLifecycle()), { endDate: opts.initialDate === undefined ? opts.endDate ?? dayjs() : undefined, initialDate: opts.initialDate }).map(x => {
        const jsonPlay = asJsonPlayObject(x);
        return generatePlayApiCommonDetailed({ playOpts: [{ state: 'queued', play: jsonPlay }], inputOpts: [{ play: jsonPlay }] })
      });
    
      const scrobbledPlay = asJsonPlayObject(await playWithLifecycleScrobble(generatePlayWithLifecycle({ lifecycleSteps: { preCompare: [true, 'skipped', true] } })));
      const scrobbledApi = generatePlayApiCommonDetailed({
        playOpts: [{ play: scrobbledPlay, state: 'scrobbled' }],
        inputOpts: [{ play: scrobbledPlay }]
      });
    
      const scrobbleErrorPlay = asJsonPlayObject(await playWithLifecycleScrobble(generatePlayWithLifecycle(), { error: true }));
    
      const scrobbleError = generatePlayApiCommonDetailed({
        playOpts: [{ play: scrobbleErrorPlay, state: 'failed' }],
        inputOpts: [{ play: scrobbleErrorPlay }]
      });
    
      const promisedScrobbled = generateArray(10, () => playWithLifecycleScrobble(generatePlayWithLifecycle({ lifecycleSteps: { preCompare: [true, 'skipped', true] } })));
      const promised = await Promise.all(promisedScrobbled);
      const yesterdayScrobbled = normalizePlays(promised, { endDate: dayjs().subtract(1, 'd').subtract(100, 'm') }).map((x) => {
        const jPlay = asJsonPlayObject(x);
        return generatePlayApiCommonDetailed({
          playOpts: [{ play: jPlay, state: 'scrobbled' }],
          inputOpts: [{ play: jPlay }]
        });
      });
      return [
        ...queued,
        scrobbledApi,
        scrobbleError,
        ...yesterdayScrobbled
      ];
}

/**
 * Generates a fake Error with nested cause errors for testing.
 * Each error has a realistic-looking stack trace with plausible call sites.
 *
 * @param depth - Number of nested cause errors to create (0 = just one error, no cause chain)
 * @returns An Error object with nested cause errors
 */
export function generateFakeError(depth: number = 0): Error {
  const commonFunctions = [
    'handleRequest',
    'processData',
    'validateInput',
    'fetchUser',
    'parseJSON',
    'connectToDatabase',
    'executeQuery',
    'mapResponse',
    'transformData',
    'authenticateUser',
    'authorizeAccess',
    'fetchFromCache',
    'updateRecord',
    'deleteResource',
    'createTransaction',
    'rollbackChanges',
    'serializeObject',
    'deserializePayload',
    'encryptData',
    'decryptData',
  ];
 
  const filePaths = [
    'src/handlers/userController.ts',
    'src/services/authService.ts',
    'src/repositories/userRepository.ts',
    'src/middleware/errorHandler.ts',
    'src/utils/dataTransformer.ts',
    'src/database/connection.ts',
    'src/api/routes/users.ts',
    'src/validators/schema.ts',
    'src/lib/helpers.ts',
    'node_modules/express/index.js',
    'src/cache/redis.ts',
    'src/external/api-client.ts',
  ];
 
  const generateStackTrace = (functionName: string): string => {
    const lines: string[] = [];
    const callDepth = Math.floor(Math.random() * 8) + 3; // 3-10 call sites
 
    for (let i = 0; i < callDepth; i++) {
      const func = i === 0 ? functionName : commonFunctions[Math.floor(Math.random() * commonFunctions.length)];
      const file = filePaths[Math.floor(Math.random() * filePaths.length)];
      const line = Math.floor(Math.random() * 500) + 1;
      const column = Math.floor(Math.random() * 80) + 1;
 
      lines.push(`    at ${func} (${file}:${line}:${column})`);
    }
 
    return lines.join('\n');
  };
 
  const messages = [
    'Connection timeout after 30000ms',
    'Failed to parse JSON response',
    'Invalid user credentials',
    'Database query failed',
    'Resource not found',
    'Permission denied',
    'Network request failed',
    'Serialization error',
    'Type validation failed',
    'Authentication required',
    'Cache miss',
    'Service unavailable',
  ];
 
  const createErrorAtDepth = (currentDepth: number): Error => {
    const message = messages[Math.floor(Math.random() * messages.length)];
    const func = commonFunctions[Math.floor(Math.random() * commonFunctions.length)];
    const error = new Error(message);
 
    // Set the function name (shows in stack trace)
    Object.defineProperty(error, 'name', {
      value: 'CustomError',
      writable: true,
      enumerable: false,
    });
 
    // Create a fake stack trace
    const stackTrace = `CustomError: ${message}\n${generateStackTrace(func)}`;
    Object.defineProperty(error, 'stack', {
      value: stackTrace,
      writable: true,
      enumerable: false,
    });
 
    // Add nested cause if depth allows
    if (currentDepth < depth) {
      const causeError = createErrorAtDepth(currentDepth + 1);
      Object.defineProperty(error, 'cause', {
        value: causeError,
        writable: true,
        enumerable: true,
      });
    }
 
    return error;
  };
 
  return createErrorAtDepth(0);
}
