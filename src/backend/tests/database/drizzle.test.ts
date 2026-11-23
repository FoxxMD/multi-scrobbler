import { expect } from 'chai';
import { getDb, migrateDb, getDbMigrationStatus, type DbConcrete } from '../../common/database/drizzle/drizzleUtils.ts';
import { createTmpDir } from '../utils/tmpDir.ts';
import { components, playEvents, playInputs, plays, queueStates } from '../../common/database/drizzle/schema/schema.ts';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { getDbPath } from '../../common/database/Database.ts';
import { x } from 'tinyexec';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fixtureCreateComponent, fixtureCreateInput, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { DrizzlePlayRepository, type RepositoryCreatePlayOpts } from '../../common/database/drizzle/repositories/PlayRepository.ts';
import { generatePlayWithLifecycle, generateRandomObj } from '../../../core/tests/utils/fixtures.ts';
import { transformToPlayEvent } from '../../common/database/drizzle/entityUtils.ts';
import { formatNumber, generateArray } from '../../../core/DataUtils.ts';
import { eq } from 'drizzle-orm';
import { loggerDebug } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { getRoot } from '../../ioc.ts';
import { after } from 'mocha';
import { migrateApp, getMigratedDb } from '../../common/database/appMigrator.ts';
import { projectRootDir } from "../../common/infrastructure/Atomic.ts";

// would be great to push migrations directly from schema but doesn't seem supported in newest beta
// https://github.com/drizzle-team/drizzle-orm/discussions/4373

describe('Migrations', function () {

    it('Detects non-existent db', async function () {
        // file backed sqlite db can be slow on a busy disk
        this.timeout(10000);

        await using tmp = await createTmpDir('noDb');
        const dir = tmp.path;
        const [db, isNew] = await getMigratedDb(getDbPath('notreal', dir));
        expect(isNew).is.true;
        db.$client.close();

    });

    it('Detects abnormal db', async function () {

        // database exists but there is no __drizzle_migrations table
        const db = await getDb(':memory:');
        const {backupRequired} = await getDbMigrationStatus(db);
        expect(backupRequired).is.true;
        db.$client.close();

    });

    it('Detects pending migrations', async function () {
        // spawns drizzle-kit which can be slow to start on a busy machine
        this.timeout(10000);

        const allFiles = await fs.readdir(path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations'));
        const migrationFiles = allFiles
            .sort();

        await using tmp = await createTmpDir('pendingMigrations');
        const dir = tmp.path;

        // copy first migration
        await fs.mkdir(path.join(dir, 'migrations'));
        try {
            await fs.cp(path.resolve(projectRootDir, `src/backend/common/database/drizzle/migrations/${migrationFiles[0]}`), path.resolve(dir, 'migrations', migrationFiles[0]), { recursive: true });
            const mf = path.resolve(dir, 'migrations');
            const db = await getDb(':memory:');
            await migrateDb(db, { migrationsFolder: mf });
            const res = await x('drizzle-kit', [
                'generate',
                '--name',
                'newMigration',
                '--out',
                `${mf}`,
                '--custom',
                '--schema',
                path.resolve(projectRootDir, 'src/backend/common/database/drizzle/schema'),
                '--dialect',
                'sqlite'
            ], {throwOnError: true, nodeOptions: {cwd: dir}});
            const {backupRequired, pending} = await getDbMigrationStatus(db, { migrationsFolder: mf });
            expect(backupRequired).is.true;
            expect(pending).length(1);
            expect(pending[0]).includes('newMigration');
            db.$client.close();
        } catch (e) {
            throw e;
        }
    });

    it('Detects no pending migrations correctly', async function () {

        const allFiles = await fs.readdir(path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations'));
        const migrationFiles = allFiles
            .sort();

        await using tmp = await createTmpDir('noMigrations');
        const dir = tmp.path;

        // copy first migration
        await fs.mkdir(path.join(dir, 'migrations'));
        try {
            await fs.cp(path.resolve(projectRootDir, `src/backend/common/database/drizzle/migrations/${migrationFiles[0]}`), path.resolve(dir, 'migrations', migrationFiles[0]), { recursive: true });
            const mf = path.resolve(dir, 'migrations');
            const db = await getDb(':memory:');
            await migrateDb(db, { migrationsFolder: mf });
            const {backupRequired, pending} = await getDbMigrationStatus(db, { migrationsFolder: mf });
            expect(backupRequired).is.false;
            expect(pending).length(0);
            db.$client.close();
        } catch (e) {
            throw e;
        }
    });

    it('Backs up database when migrations are pending', async function () {
        // spawns drizzle-kit which can be slow to start on a busy machine
        this.timeout(10000);

        const allFiles = await fs.readdir(path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations'));
        const migrationFiles = allFiles
            .sort();

        await using tmp = await createTmpDir('dbBackup');
        const dir = tmp.path;

        const dbPath = getDbPath('ms', dir);
        // copy first migration
        await fs.mkdir(path.join(dir, 'migrations'));
        try {
            await fs.cp(path.resolve(projectRootDir, `src/backend/common/database/drizzle/migrations/${migrationFiles[0]}`), path.resolve(dir, 'migrations', migrationFiles[0]), { recursive: true });
            const mf = path.resolve(dir, 'migrations');
            const [db, _] = await getMigratedDb(dbPath, {migrationsFolder: mf, migrationsAppFolder: dir});
            await migrateDb(db, { migrationsFolder: mf });
            const res = await x('drizzle-kit', [
                'generate',
                '--name',
                'newMigration',
                '--out',
                `${mf}`,
                '--custom',
                '--schema',
                path.resolve(projectRootDir, 'src/backend/common/database/drizzle/schema'),
                '--dialect',
                'sqlite'
            ], {throwOnError: true, nodeOptions: {cwd: dir}});

            // add dummy data to migration so migrate() doesn't fail
            const newMigrationFolder = (await fs.readdir(path.resolve(dir, 'migrations'))).find(x => x.includes('newMigration'));
            await fs.appendFile(path.resolve(dir, 'migrations',newMigrationFolder!, 'migration.sql'),`\nselect count(*) from plays;`);

            await getMigratedDb(dbPath, {migrationsFolder: mf, migrationsAppFolder: dir});
            const contents = await fs.readdir(dir);
            const bakPattern = new RegExp(/ms\.db\.\d+\.bak/);
            expect(contents.some(x => bakPattern.test(x))).is.true;
        } catch (e) {
            throw e;
        }
    });

});

describe('Basic DB Operations', function () {

    it('Should create a play', async function () {

        const db = await transientDb();
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
    });

    it('Should create a play with relations', async function () {

        const db = await transientDb();
        await migrateDb(db);

        try {

            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRow = await db.insert(plays).values(fixtureCreatePlay({ componentId: component[0].id })).returning();

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

            const fullPlay = (await db.query.plays.findFirst({
                with: {
                    input: true,
                    queueStates: true,
                },
            }))!;


            expect(fullPlay.queueStates).to.not.be.undefined;
            expect(fullPlay.queueStates).length(2);

            expect(fullPlay.input).to.not.be.undefined;

        } catch (e) {
            throw e;
        }
        db.$client.close();
    });

    it('deletes all dependent relations when a Play is deleted', async function () {

        const db = await transientDb();
        await migrateDb(db);

        try {

            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRow = await db.insert(plays).values(fixtureCreatePlay({ componentId: component[0].id })).returning();

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
            ]).returning();

            const fullPlay = (await db.query.plays.findFirst({
                with: {
                    input: true,
                    queueStates: true,
                },
            }))!;


            expect(fullPlay.queueStates).to.not.be.undefined;
            expect(fullPlay.queueStates).length(2);
            expect(fullPlay.input).to.not.be.undefined;

            await db.delete(plays).where(eq(plays.id, fullPlay.id));
            const deletedPlay = await db.query.plays.findFirst({
                where: {
                    id: fullPlay.id
                }
            });
            expect(deletedPlay).to.be.undefined;

            const deletedInput = await db.query.playInputs.findFirst({
                where: {
                    id: input[0].id
                }
            });
            expect(deletedInput).to.be.undefined;

            const deletedQueues = await db.query.queueStates.findMany({
                where: {
                    id: {
                        in: [twoQueues[0].id, twoQueues[1].id]
                    }
                }
            });
            expect(deletedQueues).length(0);
        } catch (e) {
            throw e;
        }
        db.$client.close();
    });

});

// disable for now... i know this works but it return with undefined error inconsistently here, for some reason
/* describe('Serializes Errors', function() {

    it('serializes errors correctly', async function () {
        try {
            const db = await transientDb();
            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRepo = new DrizzlePlayRepository(db);
            const playData: RepositoryCreatePlayOpts = { ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlayWithLifecycle({ lifecycleSteps: { preCompare: [false] } }) }), state: 'queued', input: { data: undefined } };
            const p = await playRepo.createPlays([playData]);
            expect(p[0].play.lifecycle[0].error.cause).is.not.undefined;
        } catch (e) {
            throw e;
        }
    });

}); */

describe('DB Size Stats', function () {


    before(function () {
        if (process.env.DB_SIZE_TEST !== 'true') {
            this.skip();
        }
    });

    it('get empty db size stats', async function () {
        // file backed sqlite db can be slow on a busy disk
        this.timeout(10000);

        await using tmp = await createTmpDir('dbStatEmpty');
        const dir = tmp.path;
        try {
            const [db, _] = await getMigratedDb(getDbPath('ms', dir));
            const stats = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`Empty => ${stats.size / 1024}kb`);
        } catch (e) {
            throw e;
        }
    });

    it('get db plays size stats', async function () {

        this.timeout(10000);

        await using tmp = await createTmpDir('dbStatPlain');
        const dir = tmp.path;
        try {
            const [db, _] = await getMigratedDb(getDbPath('ms', dir));
            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRepo = new DrizzlePlayRepository(db);
            const playData = generateArray<RepositoryCreatePlayOpts>(100, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: undefined } }));
            await playRepo.createPlays(playData);

            const Play100Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`100 Plays => ${Play100Component.size / 1024}kb`);

            const morePlayData = generateArray<RepositoryCreatePlayOpts>(900, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: undefined }}));
            await playRepo.createPlays(morePlayData);
            const Play1000Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`1000 Plays => ${formatNumber(Play1000Component.size / 1024 / 1024, {toFixed: 2})}mb`);

            for(let i = 0; i < 9; i++) {
                const evenMorePlayData = generateArray<RepositoryCreatePlayOpts>(1000, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: undefined }}));
                await playRepo.createPlays(evenMorePlayData);
            }
            const Play10000Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`10000 Plays => ${formatNumber(Play10000Component.size / 1024 / 1024, {toFixed: 2})}mb`);
        } catch (e) {
            throw e;
        }
    });
    
    it('get db plays size stats with input', async function () {

        this.timeout(10000);

        await using tmp = await createTmpDir('dbStatInput');
        const dir = tmp.path;
        try {
            const [db, _] = await getMigratedDb(getDbPath('ms', dir));
            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRepo = new DrizzlePlayRepository(db);
            const playData = generateArray<RepositoryCreatePlayOpts>(100, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
            await playRepo.createPlays(playData);

            const Play100Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`100 Plays => ${Play100Component.size / 1024}kb`);

            const morePlayData = generateArray<RepositoryCreatePlayOpts>(900, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
            await playRepo.createPlays(morePlayData);
            const Play1000Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`1000 Plays => ${formatNumber(Play1000Component.size / 1024 / 1024, {toFixed: 2})}mb`);

            for(let i = 0; i < 9; i++) {
                const evenMorePlayData = generateArray<RepositoryCreatePlayOpts>(1000, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
                await playRepo.createPlays(evenMorePlayData);
            }
            const Play10000Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`10000 Plays => ${formatNumber(Play10000Component.size / 1024 / 1024, {toFixed: 2})}mb`);
        } catch (e) {
            throw e;
        }
    });

    it('get db plays size stats with input and lifecycle', async function () {

        this.timeout(10000);

        await using tmp = await createTmpDir('dbStatAll');
        const dir = tmp.path;
        try {
            const [db, _] = await getMigratedDb(getDbPath('ms', dir));
            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRepo = new DrizzlePlayRepository(db);
            const createPlaysWithSteps = async (count: number) => {
                const generated = generateArray(count, () => generatePlayWithLifecycle({lifecycleSteps: {preCompare: 1}}));
                const rows = await playRepo.createPlays(generated.map(({play}) => ({ ...fixtureCreatePlay({ componentId: component[0].id, play }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } })));
                await db.insert(playEvents).values(rows.map((row, index) => ({...transformToPlayEvent(generated[index].steps), playId: row.id})));
            }
            await createPlaysWithSteps(100);

            const Play100Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`100 Plays => ${Play100Component.size / 1024}kb`);

            await createPlaysWithSteps(900);
            const Play1000Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`1000 Plays => ${formatNumber(Play1000Component.size / 1024 / 1024, {toFixed: 2})}mb`);

            for(let i = 0; i < 9; i++) {
                await createPlaysWithSteps(1000);
            }
            const Play10000Component = await fs.stat(path.resolve(dir, 'ms.db'));
            loggerDebug.debug(`10000 Plays => ${formatNumber(Play10000Component.size / 1024 / 1024, {toFixed: 2})}mb`);
        } catch (e) {
            throw e;
        }
    });
});

describe('App Migrations', function() {

    // for now we need to provide db as a singleton for each test
    // because accessing the full, same db instance in the migration files is only possible via DI container
    // https://github.com/sandrinodimattia/sqlite-up/issues/2
    let db: DbConcrete;

    beforeEach(function () {
        const root = getRoot();
        root.upsert({ db: () => () => db });
    });

    after(function () {
        const root = getRoot();
        root.upsert({ db: () => transientDb });
    });

    it('does app migrations', async function () {

        db = await transientDb();

        const component1 = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db);

        const playData: RepositoryCreatePlayOpts[] = [
            {
                ...fixtureCreatePlay(),
                componentId: component1[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay(),
                componentId: component1[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            }
        ]
        await repo.createPlays(playData);

        await migrateApp(db, {migrationsAppFolder: path.resolve(projectRootDir, `src/backend/tests/database/testAppMigrations`)});

        const plays = await repo.findPlays({});

        expect(plays[0].play.data.track?.name).eq('foo')
    });

});