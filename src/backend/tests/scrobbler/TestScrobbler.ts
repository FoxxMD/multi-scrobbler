import EventEmitter from "events";
import request from "superagent";
import { PlayObject } from "../../../core/Atomic.js";
import { Notifiers } from "../../notifier/Notifiers.js";
import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.js";
import { CommonClientConfig, CommonClientOptions, NowPlayingOptions } from "../../common/infrastructure/config/client/index.js";
import clone from "clone";
import { TimeRangeListensFetcher } from "../../common/infrastructure/Atomic.js";
import { loggerNoop } from "../../common/MaybeLogger.js";
import { DrizzlePlayRepository, RepositoryCreatePlayOpts } from "../../common/database/drizzle/repositories/PlayRepository.js";
import { DrizzleQueueRepository } from "../../common/database/drizzle/repositories/QueueRepository.js";
import { PlaySelect } from "../../common/database/drizzle/drizzleTypes.js";
import { loggerDebug } from "@foxxmd/logging";

export class TestScrobbler extends AbstractScrobbleClient {

    testRecentScrobbles: PlayObject[] = [];
    getScrobblesForTimeRange: TimeRangeListensFetcher;

    public playRepoTest: DrizzlePlayRepository;
    public queueRepoTest: DrizzleQueueRepository;

    constructor(config: CommonClientConfig = {name: 'test'}) {
        const logger = loggerNoop;
        const notifier = new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter(), logger);
        super('test', 'Test', {name: 'test', ...config}, notifier, new EventEmitter(), logger);
        this.supportsNowPlaying = false;
        this.getScrobblesForTimeRange = async (_) =>  {
            return this.testRecentScrobbles;
        }
        this.scrobbleDelay = 10;
        this.scrobbleSleep = 20;
        this.scrobbleWaitStopInterval = 20;
    }

    doScrobble(playObj: PlayObject) {
        return Promise.resolve({payload: {}, mergedScrobble: clone(playObj, true)});
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
