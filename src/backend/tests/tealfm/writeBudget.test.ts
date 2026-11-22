import { expect } from 'chai';
import { describe, it } from 'mocha';
import { Cacheable } from 'cacheable';
import { initMemoryCache } from '../../common/Cache.ts';
import { getWriteRateLimit, recordWriteRateLimit, toWriteBudget } from '../../common/vendor/atproto/WriteBudget.ts';

const headers = (limit: number, remaining: number, resetIn: number, window: number) => new Headers({
    'ratelimit-limit': String(limit),
    'ratelimit-remaining': String(remaining),
    'ratelimit-reset': String(Math.floor(Date.now() / 1000) + resetIn),
    'ratelimit-policy': `${limit};w=${window}`,
});

describe('ATProto write rate limit', function () {

    it('stores the last write headers per DID', async function () {
        const cache = new Cacheable({primary: initMemoryCache()});
        await recordWriteRateLimit(cache, 'did:plc:a', headers(5000, 4100, 600, 3600));
        const info = await getWriteRateLimit(cache, 'did:plc:a');
        expect(info).to.include({limit: 5000, remaining: 4100, policy: '5000;w=3600'});
        expect(await getWriteRateLimit(cache, 'did:plc:b')).is.undefined;
    });

    it('ignores responses without rate limit headers or with a reset in the past', async function () {
        const cache = new Cacheable({primary: initMemoryCache()});
        await recordWriteRateLimit(cache, 'did:plc:a', new Headers());
        await recordWriteRateLimit(cache, 'did:plc:a', headers(5000, 10, -5, 3600));
        expect(await getWriteRateLimit(cache, 'did:plc:a')).is.undefined;
    });

    it('uses the configured reserves, capped at half the limit', async function () {
        const info = {limit: 5000, remaining: 100, reset: Date.now(), at: Date.now()};
        expect(toWriteBudget(info)).to.include({reserve: 1000, exportReserve: 1000});
        expect(toWriteBudget(info, {rateLimitReserve: 200, exportRateLimitReserve: 3000})).to.include({reserve: 200, exportReserve: 2500});
        expect(toWriteBudget({...info, limit: 1000})).to.include({reserve: 500, exportReserve: 500});
        expect(toWriteBudget(undefined)).is.undefined;
    });
});
