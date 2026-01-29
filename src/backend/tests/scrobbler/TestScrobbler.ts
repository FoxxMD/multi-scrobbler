import { loggerTest } from "@foxxmd/logging";
import EventEmitter from "events";
import request from "superagent";
import { PlayObject } from "../../../core/Atomic.js";
import { Notifiers } from "../../notifier/Notifiers.js";
import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.js";
import { CommonClientConfig, CommonClientOptions, NowPlayingOptions } from "../../common/infrastructure/config/client/index.js";

export class TestScrobbler extends AbstractScrobbleClient {

    testRecentScrobbles: PlayObject[] = [];

    constructor(config: CommonClientConfig = {name: 'test'}) {
        const logger = loggerTest;
        const notifier = new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter(), logger);
        super('test', 'Test', {name: 'test', ...config}, notifier, new EventEmitter(), logger);
        this.supportsNowPlaying = false;
    }

    protected async getScrobblesForRefresh(limit: number): Promise<PlayObject[]> {
        return this.testRecentScrobbles;
    }

    doScrobble(playObj: PlayObject) {
        return Promise.resolve({payload: {}, mergedScrobble: playObj});
    }

    alreadyScrobbled = async (playObj: PlayObject, log?: boolean): Promise<boolean> => {
        return (await this.existingScrobble(playObj)) !== undefined;
    }

    protected async doParseCache() {
        await this.cache.init();
        return super.doParseCache();
    }



    playToClientPayload(playObject: PlayObject): object {
        return playObject;
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
