import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { getDb, migrateDb, shouldBackupDb } from '../../common/database/drizzle/drizzleUtils.js';
import withLocalTmpDir from 'with-local-tmp-dir';
import { components, playInputs, plays, queueStates } from '../../common/database/drizzle/schema/drizzlePlaysTable.js';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/PlayTestUtils.js';
import { getDbPath } from '../../common/database/Database.js';
import { x } from 'tinyexec';
import * as path from 'path';
import * as fs from 'fs/promises';
import { projectDir } from '../../common/index.js';
import { DatabaseSync } from 'node:sqlite';
import { fixtureCreateComponent, fixtureCreateInput, fixtureCreatePlay } from '../utils/databaseFixtures.js';

// would be great to push migrations directly from schema but doesn't seem supported in newest beta
// https://github.com/drizzle-team/drizzle-orm/discussions/4373

describe('Migrations', function () {

    it('Detects non-existent db', async function () {

        await withLocalTmpDir(async () => {
            const [shouldBackup, pending] = await shouldBackupDb(getDbPath('notreal', process.cwd()));
            expect(shouldBackup).is.false;
            expect(pending).length(0);
        });

    });

    it('Detects abnormal db', async function () {

        withLocalTmpDir(async () => {
            const otherdb = new DatabaseSync(path.resolve('./', 'other.db'));
            const [shouldBackup, pending] = await shouldBackupDb(getDbPath('other', process.cwd()));
            expect(shouldBackup).is.true;
            expect(pending).length(0);
            otherdb.close();
        }, { unsafeCleanup: true });

    });

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
                db.$client.close();
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true });
    });

    it('Detects no pending migrations correctly', async function () {

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
                const [shouldBackup, pending] = await shouldBackupDb(getDbPath('ms', process.cwd()), { migrationsFolder: mf });
                expect(shouldBackup).is.false;
                expect(pending).length(0);
                db.$client.close();
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true });
    });

});

describe('Basic DB Operations', function () {

    it('Should create a play', async function () {

        withLocalTmpDir(async () => {

            const db = getDb(':memory:', { workingDirectory: process.cwd() });
            await migrateDb(db);

            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRow = await db.insert(plays).values({
                componentId: component[0].id,
                state: 'queued',
                playedAt: dayjs(),
                seenAt: dayjs(),
                play: generatePlay()
            });

            expect(playRow.changes).eq(1);
            db.$client.close();
        }, { unsafeCleanup: true });
    });

    it('Should create a play with relations', async function () {

        withLocalTmpDir(async () => {

            const db = getDb(':memory:', { workingDirectory: process.cwd() });
            await migrateDb(db);

            try {

                const component = await db.insert(components).values(fixtureCreateComponent()).returning();

                const playRow = await db.insert(plays).values(fixtureCreatePlay({componentId: component[0].id})).returning();

                const input = await db.insert(playInputs).values(fixtureCreateInput({
                    playId: playRow[0].id,
                    play: playRow[0].play
                })).returning();

                const twoQueues = await db.insert(queueStates).values([
                    {
                        playId: playRow[0].id,
                        componentId: component[0].id,
                        queueName: 'foo'
                    },
                    {
                        playId: playRow[0].id,
                        componentId: component[0].id,
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

            } catch (e) {
                throw e;
            }
            db.$client.close();
        }, { unsafeCleanup: true });
    });

});

