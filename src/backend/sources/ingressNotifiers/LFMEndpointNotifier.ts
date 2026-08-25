import type {Logger} from "@foxxmd/logging";
import type {Request} from "express";
import { IngressNotifier } from "./IngressNotifier.ts";
import { parseIdentifiersFromRequest } from "../../utils/RequestUtils.ts";
import { requestMatchers } from "../EndpointLastfmSource.ts";

export class LFMEndpointNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('Lastfm Endpoint', logger);
    }

    seenSlugs: Record<string, boolean> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {

        if(!isRaw) {

            const [slug] = parseIdentifiersFromRequest(req, requestMatchers);
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
            return `Expected POST request but received ${req.method}`;
        }
        if(!isRaw) {
            if(!('method' in req.body)) {
                return `Body is missing 'method' param`
            }
        }
        return;
    }
}
