import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { getDb, migrateDb, shouldBackupDb } from '../../common/database/drizzle/drizzleUtils.js';
import withLocalTmpDir from 'with-local-tmp-dir';
import { playInputs, plays, queueStates } from '../../common/database/drizzle/schema/drizzlePlaysTable.js';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/PlayTestUtils.js';
import { getDbPath } from '../../common/database/Database.js';
import { x } from 'tinyexec';
import * as path from 'path';
import * as fs from 'fs/promises';
import { projectDir } from '../../common/index.js';

it('Detects pending migrations', async function () {

    const allFiles = await fs.readdir(path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations'));
    const migrationFiles = allFiles
        .sort();

    await withLocalTmpDir(async () => {

        // copy first migration
        await fs.mkdir('migrations');
        try {
            await fs.cp(path.resolve(projectDir, `src/backend/common/database/drizzle/migrations/${migrationFiles[0]}`), path.resolve('./migrations/', migrationFiles[0]), { recursive: true });
            const mf = path.resolve('./migrations');
            const db = getDb('ms', { workingDirectory: process.cwd() });
            await migrateDb(db, { migrationsFolder: mf });
            const res = await x('drizzle-kit', [
                'generate',
                '--name',
                'newMigration',
                '--out',
                `${mf}`,
                '--custom',
                '--schema',
                path.resolve(projectDir, 'src/backend/common/database/drizzle/schema'),
                '--dialect',
                'sqlite'
            ]);
            const [shouldBackup, pending] = await shouldBackupDb(getDbPath('ms', process.cwd()), { migrationsFolder: mf });
            expect(shouldBackup).is.true;
            expect(pending).length(1);
            expect(pending[0]).includes('newMigration');
        } catch (e) {
            throw e;
        }
    }, { unsafeCleanup: true });
});

it('Detects non-existent db', async function () {

    await withLocalTmpDir(async () => {
        const [shouldBackup, pending] = await shouldBackupDb(getDbPath('notreal', process.cwd()));
        expect(shouldBackup).is.false;
        expect(pending).length(0);
    });

});

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

