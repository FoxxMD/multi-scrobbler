import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { getDb, migrateDb, performDbMigrationWithBackup, shouldBackupDb } from '../../common/database/drizzle/drizzleUtils.js';
import withLocalTmpDir from 'with-local-tmp-dir';
import { components, playInputs, plays, queueStates } from '../../common/database/drizzle/schema/schema.js';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/PlayTestUtils.js';
import { getDbPath } from '../../common/database/Database.js';
import { x } from 'tinyexec';
import * as path from 'path';
import * as fs from 'fs/promises';
import { projectDir } from '../../common/index.js';
import { DatabaseSync } from 'node:sqlite';
import { fixtureCreateComponent, fixtureCreateInput, fixtureCreatePlay } from '../utils/databaseFixtures.js';
import { DrizzlePlayRepository, RepositoryCreatePlayOpts } from '../../common/database/drizzle/repositories/PlayRepository.js';
import { generatePlayWithLifecycle, generateRandomObj } from '../../../core/tests/utils/fixtures.js';
import { generateArray } from '../../../core/DataUtils.js';
import { objectsEqual } from '../../utils/DataUtils.js';
import { eq, sql } from 'drizzle-orm';
import { PlaySelect } from '../../common/database/drizzle/drizzleTypes.js';
import { loggerDebug } from '@foxxmd/logging';

// would be great to push migrations directly from schema but doesn't seem supported in newest beta
// https://github.com/drizzle-team/drizzle-orm/discussions/4373

describe('Migrations', function () {

    it('Detects non-existent db', async function () {

        await withLocalTmpDir(async () => {
            const [shouldBackup, pending] = await shouldBackupDb(getDbPath('notreal', process.cwd()));
            expect(shouldBackup).is.false;
            expect(pending).length(0);
        }, {postfix: 'noDb'});

    });

    it('Detects abnormal db', async function () {

        await withLocalTmpDir(async () => {
            const otherdb = new DatabaseSync(path.resolve('./', 'other.db'));
            const [shouldBackup, pending] = await shouldBackupDb(getDbPath('other', process.cwd()));
            expect(shouldBackup).is.true;
            expect(pending).length(0);
            otherdb.close();
        }, { unsafeCleanup: true, postfix: 'badDb' });

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
        }, { unsafeCleanup: true, postfix: 'pendingMigrations' });
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
        }, { unsafeCleanup: true, postfix: 'noMigrations' });
    });

    it('Backs up database when migrations are pending', async function () {

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
                db.$client.close();

                // add dummy data to migration so migrate() doesn't fail
                const newMigrationFolder = (await fs.readdir(path.resolve('./migrations/'))).find(x => x.includes('newMigration'));
                await fs.appendFile(path.resolve('./migrations/',newMigrationFolder, 'migration.sql'),`\nselect count(*) from plays;`);

                await performDbMigrationWithBackup('ms', {workingDirectory: process.cwd(), migrationsFolder: mf});      
                const contents = await fs.readdir(path.resolve('./'));
                expect(contents.some(x => x.includes('ms.db.bak')));
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true, postfix: 'dbBackup' });
    });

});

describe('Basic DB Operations', function () {

    it('Should create a play', async function () {

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
    });

    it('Should create a play with relations', async function () {

        const db = getDb(':memory:', { workingDirectory: process.cwd() });
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
    });

    it('deletes all dependent relations when a Play is deleted', async function () {

        const db = getDb(':memory:', { workingDirectory: process.cwd() });
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

            const fullPlay = await db.query.plays.findFirst({
                with: {
                    input: true,
                    queueStates: true,
                },
            });


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

describe('Repository Operations', function () {

    it('creates Plays and inputs', async function () {

        const db = getDb(':memory:');
        await migrateDb(db);

        const component = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db, {componentId: component[0].id});

        const numPlays = 3;

        const playData = generateArray<RepositoryCreatePlayOpts>(numPlays, () => ({ ...fixtureCreatePlay(), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }))

        const rows = await repo.createPlays(playData);
        expect(rows).length(numPlays);
        const fullPlays = await db.query.plays.findMany({
            with: {
                input: true
            }
        });
        fullPlays.forEach((play, index) => {
            const ref = playData[index];

            expect(play.play.data.track).eq(ref.play.data.track);
            expect(play.input).to.not.undefined;
            expect(objectsEqual(play.input.data, ref.input.data)).is.true;
        })

    });

    it('finds Plays by state', async function () {

        const db = getDb(':memory:');
        await migrateDb(db);

        const component = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db, {componentId: component[0].id});

        const numPlays = 3;

        const playData = generateArray<RepositoryCreatePlayOpts>(numPlays, () => ({
            ...fixtureCreatePlay(),
            state: 'queued',
            input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
        }));
        const discovered = {
            ...fixtureCreatePlay(),
            state: 'discovered' as 'discovered',
            input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
        };
        playData.push(discovered)

        await repo.createPlays(playData);

        const plays = await repo.findPlays({ state: ['discovered'] });
        expect(plays).length(1);
        expect(plays[0].play.data.track).eq(discovered.play.data.track);
    });

    it('finds Plays by date range', async function () {

        const db = getDb(':memory:');
        await migrateDb(db);

        const component = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db, {componentId: component[0].id});

        const playData: RepositoryCreatePlayOpts[] = [
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(2, 'm') }) }),
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(6, 'm') }) }),
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(8, 'm') }) }),
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(10, 'm') }) }),
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
        ]

        await repo.createPlays(playData);

        const newerPlays = await repo.findPlays({ playedAt: { type: 'gt', date: dayjs().subtract(3, 'm') } });
        expect(newerPlays).length(1);
        expect(newerPlays[0].play.data.track).eq(playData[0].play.data.track);

        const olderPlays = await repo.findPlays({ playedAt: { type: 'lt', date: dayjs().subtract(6, 'm').subtract(5, 's') } });
        expect(olderPlays).length(2);
        expect(olderPlays[0].play.data.track).eq(playData[2].play.data.track);
        expect(olderPlays[1].play.data.track).eq(playData[3].play.data.track);

        const bwPlays = await repo.findPlays({ playedAt: { type: 'between', range: [dayjs().subtract(9, 'm'), dayjs().subtract(3, 'm')] } });
        expect(bwPlays).length(2);
        expect(bwPlays[0].play.data.track).eq(playData[1].play.data.track);
        expect(bwPlays[1].play.data.track).eq(playData[2].play.data.track);
    });

    it('finds Plays by component', async function () {

        const db = getDb(':memory:');
        await migrateDb(db);

        const component1 = await db.insert(components).values(fixtureCreateComponent()).returning();
        const component2 = await db.insert(components).values(fixtureCreateComponent({ uid: 'test2', name: 'jelly2' })).returning();
        const component3 = await db.insert(components).values(fixtureCreateComponent({ uid: 'test3', name: 'jelly3' })).returning();

        const repo = new DrizzlePlayRepository(db);

        const playData: RepositoryCreatePlayOpts[] = [
            {
                ...fixtureCreatePlay(),
                componentId: component1[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay(),
                componentId: component3[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay(),
                componentId: component3[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            }
        ]

        await repo.createPlays(playData);

        const plays = await repo.findPlays({ componentId: component3[0].id });
        expect(plays).length(2);
        expect(plays[0].play.data.track).eq(playData[1].play.data.track);
        expect(plays[1].play.data.track).eq(playData[2].play.data.track);

        const plays1 = await repo.findPlays({ componentId: component1[0].id });
        expect(plays1).length(1);
        expect(plays1[0].play.data.track).eq(playData[0].play.data.track);

        const noPlays = await repo.findPlays({ componentId: component2[0].id });
        expect(noPlays).length(0);
    });

    it('finds purgable Plays', async function () {

        const db = getDb(':memory:');
        await migrateDb(db);

        const component1 = await db.insert(components).values(fixtureCreateComponent()).returning();
        const component2 = await db.insert(components).values(fixtureCreateComponent({ uid: 'test2', name: 'jelly2' })).returning();

        const repo = new DrizzlePlayRepository(db);

        const playData: RepositoryCreatePlayOpts[] = [
            {
                ...fixtureCreatePlay({play: generatePlay({},{seenAt: dayjs().subtract(25, 'h')})}),
                componentId: component1[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({play: generatePlay({},{seenAt: dayjs().subtract(26, 'h')})}),
                componentId: component1[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({play: generatePlay({},{seenAt: dayjs().subtract(26, 'h')})}),
                componentId: component2[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({play: generatePlay({},{seenAt: dayjs().subtract(25, 'h').subtract(1, 'm')})}),
                componentId: component1[0].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
        ]

        const initialPlays = await repo.createPlays(playData);

        const childPlays = await repo.createPlays([
            {
                ...fixtureCreatePlay({play: generatePlay({},{seenAt: dayjs().subtract(25, 'h')})}),
                componentId: component2[0].id,
                parentId: initialPlays[1].id,
                state: 'queued' as 'queued',
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
        ])

        // does not return newer plays
        expect((await repo.findPurgablePlayIds(dayjs().subtract(27, 'h'), {componentId: 1}))).length(0);

        const pPlays = await repo.findPurgablePlayIds(dayjs().subtract(24, 'h'), {componentId: 1});
        // only returns plays that do not have children
        expect(pPlays).length(2);
        expect(pPlays[0]).to.eq(initialPlays[0].id);
        expect(pPlays[1]).to.eq(initialPlays[3].id);

        // only finds plays by component
        // and allows purging if they have parent id
        const p2Plays = await repo.findPurgablePlayIds(dayjs().subtract(23, 'h'), {componentId: 2});
        expect(p2Plays).length(2);
        expect(p2Plays[0]).to.eq(initialPlays[2].id);
        expect(p2Plays[1]).to.eq(childPlays[0].id);
    });

        it('Get json property from play', async function () {

        const db = getDb(':memory:', { workingDirectory: process.cwd() });
        await migrateDb(db);

        try {

            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRows = await db.insert(plays).values([
                fixtureCreatePlay({ componentId: component[0].id, play: generatePlay({}, {source: 'test1'}) }),
                fixtureCreatePlay({ componentId: component[0].id, play: generatePlay({}, {source: 'test2'}) })
            ]).returning();

            let result: PlaySelect[];
            // https://github.com/drizzle-team/drizzle-orm/discussions/938#discussioncomment-6542336
            result = await db.select().from(plays).where(
                sql`json_extract(${plays.play}, '$.meta.source') = 'test1'`
            );

            expect(result).length(1);
            expect(result[0].play.meta.source).eq('test1');

        } catch (e) {
            throw e;
        }
        db.$client.close();
    });

});

describe('DB Size Stats', function () {


    before(function () {
        if (process.env.DB_SIZE_TEST !== 'true') {
            this.skip();
        }
    });

    it('get empty db size stats', async function () {

        await withLocalTmpDir(async () => {
            try {
                let db = getDb('ms', { workingDirectory: process.cwd() });
                await migrateDb(db);
                const stats = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`Empty => ${stats.size / 1024}kb`);
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true, postfix: 'dbStatEmpty' });
    });

    it('get db plays size stats', async function () {

        await withLocalTmpDir(async () => {
            try {
                let db = getDb('ms', { workingDirectory: process.cwd() });
                await migrateDb(db);
                const component = await db.insert(components).values(fixtureCreateComponent()).returning();

                const playRepo = new DrizzlePlayRepository(db);
                const playData = generateArray<RepositoryCreatePlayOpts>(100, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: undefined } }));
                await playRepo.createPlays(playData);

                const Play100Component = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`100 Plays => ${Play100Component.size / 1024}kb`);

                const morePlayData = generateArray<RepositoryCreatePlayOpts>(900, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: undefined }}));
                await playRepo.createPlays(morePlayData);
                const Play1000Component = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`1000 Plays => ${Play1000Component.size / 1024}kb`);
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true, postfix: 'dbStatPlain' });
    });
    
    it('get db plays size stats with input', async function () {

        await withLocalTmpDir(async () => {
            try {
                let db = getDb('ms', { workingDirectory: process.cwd() });
                await migrateDb(db);
                const component = await db.insert(components).values(fixtureCreateComponent()).returning();

                const playRepo = new DrizzlePlayRepository(db);
                const playData = generateArray<RepositoryCreatePlayOpts>(100, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
                await playRepo.createPlays(playData);

                const Play100Component = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`100 Plays => ${Play100Component.size / 1024}kb`);

                const morePlayData = generateArray<RepositoryCreatePlayOpts>(900, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlay() }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
                await playRepo.createPlays(morePlayData);
                const Play1000Component = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`1000 Plays => ${Play1000Component.size / 1024}kb`);
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true, postfix: 'dbStatInput' });
    });

    it('get db plays size stats with input and lifecycle', async function () {

        await withLocalTmpDir(async () => {
            try {
                let db = getDb('ms', { workingDirectory: process.cwd() });
                await migrateDb(db);
                const component = await db.insert(components).values(fixtureCreateComponent()).returning();

                const playRepo = new DrizzlePlayRepository(db);
                const playData = generateArray<RepositoryCreatePlayOpts>(100, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlayWithLifecycle({lifecycleSteps: {preCompare: 1}}) }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
                await playRepo.createPlays(playData);

                const Play100Component = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`100 Plays => ${Play100Component.size / 1024}kb`);

                const morePlayData = generateArray<RepositoryCreatePlayOpts>(900, () => ({ ...fixtureCreatePlay({ componentId: component[0].id, play: generatePlayWithLifecycle({lifecycleSteps: {preCompare: 1}}) }), state: 'queued', input: { data: generateRandomObj(undefined, { allowUndefined: false }) } }));
                await playRepo.createPlays(morePlayData);
                const Play1000Component = await fs.stat(path.resolve('./ms.db'));
                loggerDebug.debug(`1000 Plays => ${Play1000Component.size / 1024}kb`);
            } catch (e) {
                throw e;
            }
        }, { unsafeCleanup: true, postfix: 'dbStatAll' });
    });
})