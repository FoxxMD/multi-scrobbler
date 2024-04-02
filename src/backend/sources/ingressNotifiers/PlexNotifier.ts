import { Logger } from "@foxxmd/logging";
import { Request } from "express";
import PlexSource from "../PlexSource.js";
import { IngressNotifier } from "./IngressNotifier.js";

export class PlexNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('Plex', logger);
    }

    seenServers: string[] = [];
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {
        if(!isRaw) {
            const { payload } = req as any;
            if(payload === undefined) {

                return [false, 'Received a request without any data'];

            }

            const playObj = PlexSource.formatPlayObj(payload, {newFromSource: true});

            if(playObj.meta.server === undefined) {
                return [false, `Payload from Plex did not contain server info! Check Plex logs for any errors.`];
            }

            if(!this.seenServers.includes(playObj.meta.server)) {
                this.seenServers.push(playObj.meta.server);
                return [true, `Received valid data from server ${playObj.meta.server} for the first time.`];
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
