import type {Logger} from "@foxxmd/logging";
import type {Request} from "express";
import path from "path";
import { firstSeen, IngressNotifier } from "./IngressNotifier.ts";

export class WebhookNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('WebScrobbler', logger);
    }

    async notifyBySource(req: Request, isRaw: boolean): Promise<[boolean, (string | undefined)]> {

        if(!isRaw) {
            const parts = path.parse(req.path);
            const slug = parts.name;

            if(await firstSeen(this.seenSlugs, slug)) {
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
