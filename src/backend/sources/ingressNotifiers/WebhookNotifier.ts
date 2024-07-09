import { Logger } from "@foxxmd/logging";
import { Request } from "express";
import path from "path";
import { IngressNotifier } from "./IngressNotifier.js";

export class WebhookNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('WebScrobbler', logger);
    }

    seenSlugs: Record<string, boolean> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {

        if(!isRaw) {
            const parts = path.parse(req.path);
            const slug = parts.name;

            if(this.seenSlugs[slug] === undefined) {
                this.seenSlugs[slug] = true;
                return [true, `Received data for API URL slug '${slug === 'webscrobbler' ? '(none)' : slug}' for the first time.`];
            }
        }

        return [true, undefined];
    }

    notifyByRequest(req: Request, isRaw: boolean): string | undefined {
        if(req.method !== 'POST' && req.method !== 'OPTIONS') {
            return `Expected POST or OPTIONS request (webhook payload) but received ${req.method}`;
        }
        return;
    }
}
