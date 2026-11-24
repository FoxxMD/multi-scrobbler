import { expect } from 'chai';
import { describe, it } from 'mocha';
import { firstSeen, INGRESS_SEEN_MAX, seenCache } from '../../sources/ingressNotifiers/IngressNotifier.ts';

describe('Ingress seen cache', function () {

    it('is first seen only once', async function () {
        const cache = seenCache();
        expect(await firstSeen(cache, 'a')).eq(true);
        expect(await firstSeen(cache, 'a')).eq(false);
    });

    it(`forgets the least recently used key past ${INGRESS_SEEN_MAX} keys`, async function () {
        const cache = seenCache();
        for (let i = 0; i <= INGRESS_SEEN_MAX; i++) {
            await firstSeen(cache, `${i}`);
        }
        expect(await firstSeen(cache, `${INGRESS_SEEN_MAX}`)).eq(false);
        expect(await firstSeen(cache, '0')).eq(true);
    });
});
