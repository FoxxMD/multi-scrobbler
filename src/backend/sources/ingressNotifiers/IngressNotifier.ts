import { childLogger, type Logger } from '@foxxmd/logging';
import type {Request} from "express";
import { remoteHostIdentifiers, remoteHostStr } from "../../utils.ts";
import { initMemoryCache } from "../../common/Cache.ts";

/** max remotes/slugs remembered for first-seen logging. Requests are not authenticated yet so these come from anyone */
export const INGRESS_SEEN_MAX = 50;

/** LRU of seen keys, capped at INGRESS_SEEN_MAX, that never expire */
export const seenCache = () => initMemoryCache<boolean>({lruSize: INGRESS_SEEN_MAX, ttl: 0, checkInterval: 0});

/** true if key was not in the cache, and remembers it */
export const firstSeen = async (cache: ReturnType<typeof seenCache>, key: string): Promise<boolean> => {
    if (await cache.get(key) !== undefined) {
        return false;
    }
    await cache.set(key, true);
    return true;
}


export abstract class IngressNotifier {

    identifier: string;
    logger: Logger;

    remotes = seenCache();
    seenSlugs = seenCache();

    protected constructor(name: string, logger: Logger) {
        this.identifier = name;
        this.logger = childLogger(logger, ['Ingress', name]);
    }

    public async trackIngress(req: Request, isRaw: boolean) {
        const parts = remoteHostIdentifiers(req);
        const id = `${parts.host}-${parts.proxy ?? ''}`;

        const notifs: string[] = [];

        const newRemote = await firstSeen(this.remotes, id);
        if (newRemote) {
            notifs.push(`Received request from a new remote address: ${remoteHostStr(req)}`);
        }
        const requestNotif = this.notifyByRequest(req, isRaw);
        if (requestNotif !== undefined) {
            notifs.push(`${!newRemote ? remoteHostStr(req) : ''} ${requestNotif}`);
        }
        const [sourceValid, sourceNotif] = await this.notifyBySource(req, isRaw);
        if (sourceNotif !== undefined) {
            notifs.push(`${!newRemote && requestNotif === undefined ? `${remoteHostStr(req)} ` : ''}${sourceNotif}`);
        }

        if(notifs.length > 0) {
            if (requestNotif !== undefined || sourceValid === false) {
                this.logger.warn(notifs.join(' | '));
            } else {
                this.logger.info(notifs.join(' | '))
            }
        }
    }

    notifyByRequest(req: Request, isRaw: boolean): string | undefined {
        return;
    }

    abstract notifyBySource(req: Request, isRaw: boolean): Promise<[boolean, string | undefined]>;
}
