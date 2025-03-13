import { Logger } from "@foxxmd/logging";
import { Request } from "express";
import { EndpointListenbrainzSource } from "../EndpointListenbrainzSource.js";
import { IngressNotifier } from "./IngressNotifier.js";

export class LZEndpointNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('Listenbrainz Endpoint', logger);
    }

    seenSlugs: Record<string, boolean> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {

        if(!isRaw) {

            const [slug, token] = EndpointListenbrainzSource.parseIdentifiersFromRequest(req);
            if(slug === false) {
                return [false, `Request URL was not a valid: ${req.baseUrl}`];
            }
            const slugStr = slug ?? '(no slug)';

            if(token === false) {
                return [false, `Request URL was valid and 'Authorization' header was present but invalid. Authorization header should be 'Token tokenValue' but was '${req.header('Authorization')}'`];
            }
            const tokenStr = token ?? '(no token)';
            const redactedToken = token !== undefined ? `${(token as string).substring(0,3)}****` : '(no token)';

            const identifier = `${slugStr}-${tokenStr}`;

            if(this.seenSlugs[identifier] === undefined) {
                this.seenSlugs[identifier] = true;
                return [true, `Received a well formed request to endpoint with -- Slug: ${slugStr} | Token: ${redactedToken} -- for the first time.`];
            }
        }

        return [true, undefined];
    }

    notifyByRequest(req: Request, isRaw: boolean): string | undefined {
        if(req.method !== 'POST') {
            return `Expected POST request (submit-listen payload) but received ${req.method}`;
        }
        return;
    }
}
