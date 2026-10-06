import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';
import { eq } from 'drizzle-orm';
import pEvent from 'p-event';
import { loggerTest } from '@foxxmd/logging';
import { components, plays } from '../../common/database/drizzle/schema/schema.ts';
import type { DbConcrete } from '../../common/database/drizzle/drizzleUtils.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';
import { TestSource } from '../source/TestSource.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import type { MSBackendEventMap } from '../../common/infrastructure/MSBackendEventMap.ts';

// countLive is the lifetime Discovered/Scrobbled total shown on the dashboard.
// It must keep counting across restarts, and must not depend on Plays that
// retention has since deleted.

// The test container gives every component a fresh in-memory database. A restart has
// to find the row the previous run wrote, so these components share one.
let sharedDb: DbConcrete;

class SharedDbScrobbler extends TestScrobbler {
    protected override async getDatabase() {
        return sharedDb;
    }
}

class SharedDbSource extends TestSource {
    protected override async getDatabase() {
        return sharedDb;
    }
}

const readCountLive = async (componentId: number): Promise<number> => {
    const row = await sharedDb.select({ countLive: components.countLive }).from(components).where(eq(components.id, componentId));
    return row[0].countLive;
}

// stands in for retention deleting old Plays
const deleteComponentPlays = async (componentId: number) => {
    await sharedDb.delete(plays).where(eq(plays.componentId, componentId));
}

const startScrobbler = async (id: string) => {
    const client = new SharedDbScrobbler({ name: 'test', id });
    await client.initialize();
    return client;
}

const emitter = new WildcardEmitter<MSBackendEventMap>();
const startSource = async (id: string) => {
    const source = new SharedDbSource('spotify', 'test-counts', { id }, { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' }, emitter);
    await source.initialize();
    await source.initTasks();
    return source;
}

describe('Persisted Discovered/Scrobbled counts', function () {

    before(async function () {
        sharedDb = await transientDb();
    });

    after(function () {
        sharedDb.$client.close();
    });

    describe('Clients', function () {

        it('Adds every scrobble to the stored count, not just the first one of a session', async function () {
            const client = await startScrobbler(`counts-client-${Date.now()}`);

            for (let i = 0; i < 3; i++) {
                await client.addScrobbledTrack(generatePlay());
            }

            expect(await readCountLive(client.componentId)).to.eq(3);
        });

        it('Keeps the total across a restart, even after retention deleted the Plays', async function () {
            const id = `counts-client-restart-${Date.now()}`;
            const first = await startScrobbler(id);
            for (let i = 0; i < 3; i++) {
                await first.addScrobbledTrack(generatePlay());
            }
            await deleteComponentPlays(first.componentId);

            const restarted = await startScrobbler(id);
            expect(restarted.getApiData().countLive).to.eq(3);

            await restarted.addScrobbledTrack(generatePlay());
            expect(restarted.getApiData().countLive).to.eq(4);
            expect(await readCountLive(restarted.componentId)).to.eq(4);
        });
    });

    describe('Sources', function () {

        it('Adds each discovered Play to the stored count and keeps it across a restart', async function () {
            const id = `counts-source-${Date.now()}`;
            const source = await startSource(id);

            for (const play of [generatePlay({ track: {name: 'first'} }), generatePlay({ track: {name: 'second'} })]) {
                await Promise.all([
                    pEvent(source.emitter, 'discoveredToScrobble'),
                    source.queuePlay([play]),
                ]);
            }
            expect(await readCountLive(source.componentId)).to.eq(2);
            await source[Symbol.asyncDispose]();

            await deleteComponentPlays(source.componentId);
            await using restarted = await startSource(id);
            expect(restarted.getApiData().countLive).to.eq(2);
        });
    });
});
