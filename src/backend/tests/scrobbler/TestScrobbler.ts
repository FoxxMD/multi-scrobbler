import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient";
import {PlayObject} from "../../../core/Atomic";
import {getLogger} from "../../common/logging";
import {Notifiers} from "../../notifier/Notifiers";
import EventEmitter from "events";

export class TestScrobbler extends AbstractScrobbleClient {

    constructor() {
        const logger = getLogger({});
        const notifier = new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter());
        super('test', 'Test', {name: 'test'}, notifier, new EventEmitter(), logger);
    }

    scrobble(playObj: PlayObject): Promise<boolean> {
        return Promise.resolve(true);
    }

    alreadyScrobbled = async (playObj: PlayObject, log?: boolean): Promise<boolean> => {
        return (await this.existingScrobble(playObj)) !== undefined;
    }

}
