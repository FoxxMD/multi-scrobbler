import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { getDb, migrateDb, shouldBackupDb } from '../../common/database/drizzle/drizzleUtils.js';
import withLocalTmpDir from 'with-local-tmp-dir';
import { plays } from '../../common/database/drizzle/schema/drizzlePlaysTable.js';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/PlayTestUtils.js';
import { getDbPath } from '../../common/database/Database.js';

it('Detects pending migrations', async function () {

    const res = await shouldBackupDb(getDbPath(undefined, process.cwd()));

    expect(res).to.be.undefined;

});

it('Should create a play', async function () {

    withLocalTmpDir(async () => {

        const db = getDb(undefined, {workingDirectory: process.cwd()});
        await migrateDb(db);

        const playRow = await db.insert(plays).values({
            id: nanoid(),
            componentName: 'mySpot',
            componentType: 'spotify',
            playedAt: dayjs(),
            seenAt: dayjs(),
            play: generatePlay()
        });

        const f = 1;

    }, { unsafeCleanup: false });
});