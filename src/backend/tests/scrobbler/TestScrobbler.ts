import EventEmitter from "events";
import request from "superagent";
import type {PlayObject} from "../../../core/Atomic.ts";
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

export class TestScrobbler extends AbstractScrobbleClient {

    testRecentScrobbles: PlayObject[] = [];
    getScrobblesForTimeRange: TimeRangeListensFetcher;

    public playRepoTest: DrizzlePlayRepository;
    public queueRepoTest: DrizzleQueueRepository;

    constructor(config: CommonClientConfig = {name: 'test'}) {
        const logger = loggerNoop;
        super('test', 'Test', {name: 'test', ...config}, new EventEmitter(), logger);
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
    constructor() {
        super();
        this.requiresAuth = true;
    }
    doAuthentication = async() => {
        try {
            await request.get('http://example.com');
            return true;
        } catch (e) {
            throw e;
        }
    }
}

export type TestNowPlayingConfig = CommonClientConfig & {options?: CommonClientOptions & NowPlayingOptions};

export class NowPlayingScrobbler extends TestScrobbler {
    declare config: TestNowPlayingConfig

    constructor(config?: TestNowPlayingConfig) {
        super(config);
        this.supportsNowPlaying = true;
    }
}
