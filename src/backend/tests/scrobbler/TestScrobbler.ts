import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.js";
import { PlayObject } from "../../../core/Atomic.js";
import { getLogger } from "../../common/logging.js";
import { Notifiers } from "../../notifier/Notifiers.js";
import EventEmitter from "events";
import request from "superagent";

export class TestScrobbler extends AbstractScrobbleClient {

    constructor() {
        const logger = getLogger({});
        const notifier = new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter());
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
