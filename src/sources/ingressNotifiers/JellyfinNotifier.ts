import {IngressNotifier} from "./IngressNotifier.js";
import {Request} from "express";
import JellyfinSource from "../JellyfinSource.js";

export class JellyfinNotifier extends IngressNotifier {

    constructor() {
        super('Jellyfin');
    }

    seenServers: Record<string, string> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {
        if(!isRaw) {
            const playObj = JellyfinSource.formatPlayObj(req.body);

            if(playObj.meta.server === undefined) {
                return [false, `Payload from Jellyfin did not contain server info! Make sure 'Send all Properties' is checked in webhook`];
            }

            if(this.seenServers[playObj.meta.server] === undefined) {
                this.seenServers[playObj.meta.server] = playObj.meta.sourceVersion;
                return [true, `Received valid data from server ${playObj.meta.server} (Version ${playObj.meta.sourceVersion}) for the first time.`];
            }
        }
        return [true, undefined];
    }

    notifyByRequest(req: Request, isRaw: boolean): string | undefined {
        if(req.method !== 'POST') {
            return `Expected POST request (webhook payload) but received ${req.method}`;
        }
        return;
    }

}
