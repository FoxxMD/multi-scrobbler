import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { isAbortError } from 'abort-controller-x';
import { eq } from 'drizzle-orm';
import { TestScrobbler } from './TestScrobbler.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { nameToCredit } from '../../../core/MusicMetadata.ts';
import { PlayParkedError } from '../../common/errors/MSErrors.ts';
import { playEvents, plays } from '../../common/database/drizzle/schema/schema.ts';
import type { PlayObject } from '../../../core/PlaySchema.ts';

const until = async (fn: () => boolean | Promise<boolean>, ms = 3000) => {
    const start = Date.now();
    while (!(await fn())) {
        if (Date.now() - start > ms) {
            throw new Error('timed out');
        }
        await new Promise(r => setTimeout(r, 10));
    }
}

describe('Parked plays', function () {

    it('stay queued while later plays are processed, then are processed once their wait ends', async function () {
        await using scrobbler = new TestScrobbler();
        await scrobbler.initialize();
        const db = scrobbler.playRepoTest.db;

        // parked twice for the same reason (IE a failed pass), then released
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        let parks = 0;
        scrobbler.getSOTScrobblesForPlay = async (play: PlayObject) => {
            if (play.data.track?.name === 'old' && parks < 2) {
                parks++;
                throw new PlayParkedError('Waiting for older scrobbles', parks === 1 ? Promise.reject(new Error('pass failed')) : gate);
            }
            return [];
        };
        const emptied: number[] = [];
        scrobbler.emitter.on('queueEmptied', (e: {data: {processed: number}}) => emptied.push(e.data.processed));

        await scrobbler.queuePlay(generatePlay({track: nameToCredit('old'), playDate: dayjs().subtract(1, 'year')}));
        await scrobbler.queuePlay(generatePlay({track: nameToCredit('live'), playDate: dayjs().subtract(1, 'minute')}));
        const stateOf = async (name: string) => (await db.select().from(plays)).find(x => x.play.data.track?.name === name)?.state;

        const processing = new AbortController();
        scrobbler.startScrobbling(processing.signal).catch((e) => {
            if (!isAbortError(e)) {
                console.error(e);
            }
        });
        try {
            await until(async () => await stateOf('live') === 'scrobbled' && parks === 2);
            expect(await stateOf('old')).eq('queued');
            expect(scrobbler.queuedLength).eq(1);

            const old = (await db.select().from(plays)).find(x => x.play.data.track?.name === 'old')!;
            const events = await db.select().from(playEvents).where(eq(playEvents.playId, old.id));
            const parkEvents = events.filter(x => x.eventName === 'playStateChange' && (x.data as {reason?: string}).reason === 'Waiting for older scrobbles');
            // recorded once, not again when parked for the same reason
            expect(parkEvents).length(1);
            expect((parkEvents[0].data as {state: string}).state).eq('queued');
            // only the live play was processed, a drain of only parked plays does not empty the queue
            expect(emptied.reduce((a, b) => a + b, 0)).eq(1);

            release();
            await until(async () => await stateOf('old') === 'scrobbled');
            expect(scrobbler.queuedLength).eq(0);
            await until(() => emptied.reduce((a, b) => a + b, 0) === 2);
        } finally {
            processing.abort();
        }
    });
});
