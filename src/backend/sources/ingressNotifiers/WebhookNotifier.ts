import {IngressNotifier} from "./IngressNotifier";
import {Request} from "express";
import path from "path";

export class WebhookNotifier extends IngressNotifier {

    constructor() {
        super('WebScrobbler');
    }

    seenSlugs: Record<string, boolean> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {

        if(!isRaw) {
            // let cleanPath = req.path;
            // if(cleanPath.charAt(cleanPath.length - 1) === '/') {
            //     cleanPath = cleanPath.slice(0, -1);
            // }
            // const splitPath = cleanPath.split('/');
            // const slug = splitPath[cleanPath.length - 1];
            const parts = path.parse(req.path);
            const slug = parts.name;

            if(this.seenSlugs[slug] === undefined) {
                this.seenSlugs[slug] = true;
                return [true, `Received valid data for API URL slug '${slug === 'webscrobbler' ? '(none)' : slug}' for the first time.`];
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
