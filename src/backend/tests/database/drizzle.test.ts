import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { getDb, migrateDb, shouldBackupDb } from '../../common/database/drizzle/drizzleUtils.js';
import withLocalTmpDir from 'with-local-tmp-dir';
import { playInputs, plays, queueStates } from '../../common/database/drizzle/schema/drizzlePlaysTable.js';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/PlayTestUtils.js';
import { getDbPath } from '../../common/database/Database.js';

// it('Detects pending migrations', async function () {

//     const res = await shouldBackupDb(getDbPath(undefined, process.cwd()));

//     expect(res).to.be.undefined;

// });

describe('Basic DB Operations', function () {

    it('Should create a play', async function () {

        withLocalTmpDir(async () => {

            const db = getDb(':memory:', { workingDirectory: process.cwd() });
            await migrateDb(db);

            const playRow = await db.insert(plays).values({
                id: nanoid(),
                componentName: 'mySpot',
                componentType: 'spotify',
                playedAt: dayjs(),
                seenAt: dayjs(),
                play: generatePlay()
            });

            expect(playRow.changes).eq(1);

        }, { unsafeCleanup: true });
    });

    it('Should create a play with relations', async function () {

        withLocalTmpDir(async () => {

            const db = getDb(':memory:', { workingDirectory: process.cwd() });
            await migrateDb(db);

            const id = nanoid();
            const playRow = await db.insert(plays).values({
                id,
                componentName: 'mySpot',
                componentType: 'spotify',
                playedAt: dayjs(),
                seenAt: dayjs(),
                play: generatePlay()
            }).returning();

            const input = await db.insert(playInputs).values({
                playId: playRow[0].id,
                play: playRow[0].play,
                data: { anything: 'foo' }
            }).returning();

            const twoQueues = await db.insert(queueStates).values([
                {
                    playId: id,
                    queueName: 'foo',
                    queueStatus: 'queued'
                },
                {
                    playId: id,
                    queueName: 'bar',
                    queueStatus: 'completed'
                }
            ]);

            const fullPlay = await db.query.plays.findFirst({
                with: {
                    input: true,
                    queueStates: true,
                },
            });

            expect(fullPlay.queueStates).to.not.be.undefined;
            expect(fullPlay.queueStates).length(2);

            expect(fullPlay.input).to.not.be.undefined;

        }, { unsafeCleanup: true });
    });

});

