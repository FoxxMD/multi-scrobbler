import { Logger } from "@foxxmd/logging";
import { Request } from "express";
import { parseIdentifiersFromRequest } from "../EndpointLastfmSource.ts";
import { IngressNotifier } from "./IngressNotifier.ts";
import { LastfmTrackUpdateRequest } from "lastfm-node-client";

export class LFMEndpointNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('Lastfm Endpoint', logger);
    }

    seenSlugs: Record<string, boolean> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {

        if(!isRaw) {

            const [slug] = parseIdentifiersFromRequest(req);
            if(slug === false) {
                return [false, `Request URL was not valid: ${req.baseUrl}`];
            }
            const slugStr = slug ?? '(no slug)';

            const identifier = `${slugStr}`;

            if(this.seenSlugs[identifier] === undefined) {
                this.seenSlugs[identifier] = true;
                return [true, `Received a request to endpoint with -- Slug: ${slugStr} -- for the first time.`];
            }
        }

        return [true, undefined];
    }

    notifyByRequest(req: Request, isRaw: boolean): string | undefined {
        if(req.method !== 'POST') {
            return `Expected POST request (track.scrobble payload) but received ${req.method}`;
        }
        if(!isRaw) {
            if(!('method' in req.body)) {
                return `Body is missing 'method' param`
            }
            const method = (req.body as LastfmTrackUpdateRequest).method;
            if(!['track.updateNowPlaying','track.scrobble'].includes(method)) {
                return `Unexpected 'method' param value '${method}', expected either 'track.updateNowPlaying' or 'track.scrobble'`
            }
        }
        return;
    }
}
