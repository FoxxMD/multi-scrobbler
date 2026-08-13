import EventEmitter from "events";
import request from "superagent";
import {COMPONENT_AUTH_TYPE, type ComponentAuthType, type PlayObject} from "../../../core/Atomic.ts";
import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.ts";
import type {CommonClientConfig, CommonClientOptions, NowPlayingOptions} from "../../common/infrastructure/config/client/index.ts";
import clone from "clone";
import type {TimeRangeListensFetcher} from "../../common/infrastructure/Atomic.ts";
import { loggerNoop } from "../../common/MaybeLogger.ts";
import type { DrizzlePlayRepository} from "../../common/database/drizzle/repositories/PlayRepository.ts";
import type {RepositoryCreatePlayOpts} from "../../common/database/drizzle/repositories/PlayRepository.ts";
import type { DrizzleQueueRepository } from "../../common/database/drizzle/repositories/QueueRepository.ts";
import type {PlaySelect} from "../../common/database/drizzle/drizzleTypes.ts";
import dayjs from "dayjs";
import type { MarkOptional, MarkRequired } from "ts-essentials";
import { AuthError } from "../../common/errors/MSErrors.ts";
import { isSuperAgentResponseError } from "../../common/errors/ErrorUtils.ts";

export class TestScrobbler extends AbstractScrobbleClient {

    testRecentScrobbles: PlayObject[] = [];
    getScrobblesForTimeRange: TimeRangeListensFetcher;

    public playRepoTest: DrizzlePlayRepository;
    public queueRepoTest: DrizzleQueueRepository;

    constructor(config: MarkOptional<CommonClientConfig, 'id'> = {name: 'test'}) {
        const logger = loggerNoop;
        super('test', 'Test', {name: 'test', id: `test-${Date.now()}`, ...config}, new EventEmitter(), logger);
        this.supportsNowPlaying = false;
        this.getScrobblesForTimeRange = async (_) =>  {
            return this.testRecentScrobbles;
        }
        this.scrobbleDelay = 10;
        this.scrobbleSleep = 20;
        this.scrobbleWaitStopInterval = 20;
    }

    doScrobble(playObj: PlayObject) {
        return Promise.resolve({payload: {}, mergedScrobble: clone(playObj, true), createdAt: dayjs().toISOString()});
    }

    protected async doParseCache() {
        await this.cache.init();
        return super.doParseCache();
    }

    protected async postDatabase(): Promise<void> {
        super.postDatabase();
        this.playRepoTest = this.playRepo;
        this.queueRepoTest = this.queueRepo;
    }

    playToClientPayload(playObject: PlayObject): object {
        return playObject;
    }

    addScrobbled = async (plays: PlayObject[]): Promise<PlaySelect[]> => {
        const newPlayData: RepositoryCreatePlayOpts[] = plays.map(x => ({play: x, state: 'scrobbled', input: {}}));
        return await this.playRepoTest.createPlays(newPlayData);
    }

}

export class TestAuthScrobbler extends TestScrobbler {
    override authType: ComponentAuthType = COMPONENT_AUTH_TYPE.unattended;

    constructor() {
        super();

        this.requiresAuth = true;
    }
    doAuthentication = async() => {
        try {
            await request.get('http://example.com');
            return true;
        } catch (e) {
            throw new AuthError('Failed to auth', {cause: e, unrecoverable: isSuperAgentResponseError(e) && [401,403].includes(e.status)});
        }
    }
}

export type TestNowPlayingConfig = MarkOptional<CommonClientConfig, 'id'> & {options?: CommonClientOptions & NowPlayingOptions};

export class NowPlayingScrobbler extends TestScrobbler {
    declare config: MarkRequired<TestNowPlayingConfig, 'id'>

    constructor(config?: TestNowPlayingConfig) {
        super(config);
        this.supportsNowPlaying = true;
    }
}
