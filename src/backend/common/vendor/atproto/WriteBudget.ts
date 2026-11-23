import { parseRateLimitHeaders } from '@atcute/client';
import type { Cacheable } from 'cacheable';
import type { Millisecond } from '../../../../core/Atomic.ts';
import { DEFAULT_RATE_LIMIT_RESERVE, type ATProtoRateLimitOptions } from '../../infrastructure/config/client/atproto.ts';

/**
 * Rate limit headers from the last write to a PDS.
 *
 * A PDS checks a write against all of its limits (per IP, writes per hour, writes per day)
 * and its headers describe only the limit with the fewest points left.
 * So `remaining` is always the tightest limit right now, and a limit with room left is hidden until it is the tightest.
 * */
export interface WriteRateLimit {
    limit: number
    remaining: number
    /** when the reported limit resets */
    reset: Millisecond
    /** `<limit>;w=<seconds>` */
    policy?: string
    /** when these headers were read */
    at: Millisecond
}

export interface WriteBudget extends WriteRateLimit {
    /** points to keep free for live scrobbles */
    reserve: number
    /** points to keep free for exports */
    exportReserve: number
}

// by DID because the PDS counts write limits per account, shared by every client writing to it
const budgetKey = (did: string) => `atproto-writeRateLimit-${did}`;

/** Store the rate limit headers from a write response (or a write error response) */
export const recordWriteRateLimit = async (cache: Cacheable, did: string | undefined, headers?: Headers | null): Promise<void> => {
    if(did === undefined || headers === undefined || headers === null) {
        return;
    }
    const info = parseRateLimitHeaders(headers);
    if(info === null) {
        return;
    }
    const ttl = info.reset.getTime() - Date.now();
    if(ttl <= 0) {
        return;
    }
    await cache.set<WriteRateLimit>(budgetKey(did), {limit: info.limit, remaining: info.remaining, reset: info.reset.getTime(), policy: info.policy ?? undefined, at: Date.now()}, ttl);
}

export const getWriteRateLimit = async (cache: Cacheable, did: string | undefined): Promise<WriteRateLimit | undefined> => {
    if(did === undefined) {
        return undefined;
    }
    return await cache.get<WriteRateLimit>(budgetKey(did));
}

/** At most half the limit, so a PDS with a low limit does not pause scrobbling for good */
export const effectiveReserve = (reserve: number, limit: number) => Math.min(reserve, Math.floor(limit / 2));

export const toWriteBudget = (info: WriteRateLimit | undefined, opts: ATProtoRateLimitOptions = {}): WriteBudget | undefined => {
    if(info === undefined) {
        return undefined;
    }
    const {
        rateLimitReserve = DEFAULT_RATE_LIMIT_RESERVE,
        exportRateLimitReserve = DEFAULT_RATE_LIMIT_RESERVE
    } = opts;
    return {...info, reserve: effectiveReserve(rateLimitReserve, info.limit), exportReserve: effectiveReserve(exportRateLimitReserve, info.limit)};
}
