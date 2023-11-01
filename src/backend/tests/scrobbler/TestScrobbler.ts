import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient";
import {PlayObject} from "../../../core/Atomic";
import {getLogger} from "../../common/logging";
import {Notifiers} from "../../notifier/Notifiers";
import EventEmitter from "events";
import {http} from "msw";
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

}
