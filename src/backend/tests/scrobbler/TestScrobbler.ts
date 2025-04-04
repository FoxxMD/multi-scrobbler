import { loggerTest } from "@foxxmd/logging";
import EventEmitter from "events";
import request from "superagent";
import { PlayObject } from "../../../core/Atomic.ts";
import { Notifiers } from "../../notifier/Notifiers.ts";
import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.ts";

export class TestScrobbler extends AbstractScrobbleClient {

    testRecentScrobbles: PlayObject[] = [];

    constructor() {
        const logger = loggerTest;
        const notifier = new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter(), logger);
        super('test', 'Test', {name: 'test'}, notifier, new EventEmitter(), logger);
    }

    protected async getScrobblesForRefresh(limit: number): Promise<PlayObject[]> {
        return this.testRecentScrobbles;
    }

    doScrobble(playObj: PlayObject): Promise<PlayObject> {
        return Promise.resolve(playObj);
    }

    alreadyScrobbled = async (playObj: PlayObject, log?: boolean): Promise<boolean> => {
        return (await this.existingScrobble(playObj)) !== undefined;
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
