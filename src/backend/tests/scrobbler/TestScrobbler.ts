import { loggerTest } from "@foxxmd/logging";
import EventEmitter from "events";
import request from "superagent";
import { PlayObject } from "../../../core/Atomic.js";
import { Notifiers } from "../../notifier/Notifiers.js";
import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.js";

export class TestScrobbler extends AbstractScrobbleClient {

    constructor() {
        const logger = loggerTest;
        const notifier = new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter(), logger);
        super('test', 'Test', {name: 'test'}, notifier, new EventEmitter(), logger);
    }

    doScrobble(playObj: PlayObject): Promise<PlayObject> {
        return Promise.resolve(playObj);
    }

    alreadyScrobbled = async (playObj: PlayObject, log?: boolean): Promise<boolean> => {
        return (await this.existingScrobble(playObj)) !== undefined;
    }

    doAuthentication = async() => {
        try {
            await request.get('http://example.com');
            return true;
        } catch (e) {
            throw e;
        }
    }

    playToClientPayload(playObject: PlayObject): object {
        return playObject;
    }

}
