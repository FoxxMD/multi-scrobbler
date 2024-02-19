import { IngressNotifier } from "./IngressNotifier.js";
import {Request} from "express";
import PlexSource from "../PlexSource.js";
import TautulliSource from "../TautulliSource.js";

export class TautulliNotifier extends IngressNotifier {

    constructor() {
        super('Tautulli');
    }

    seenServers: string[] = [];
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {
        if(!isRaw) {
            const playObj = TautulliSource.formatPlayObj(req, {newFromSource: true});

            if(!this.seenServers.includes(playObj.meta.server)) {
                this.seenServers.push(playObj.meta.server);
                const msg = [`Received data from server ${playObj.meta.server} for the first time.`];
                if(req.body === undefined) {
                    msg.push('WARNING: Payload was empty.');
                }
                if(playObj.meta.library === undefined) {
                    msg.push('WARNING: library was not defined in payload. If you want to filter plays by library this must be present in webhook payload.');
                }
                return [true, msg.join(' ')];
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
