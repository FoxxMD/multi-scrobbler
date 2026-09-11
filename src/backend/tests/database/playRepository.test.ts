import { expect } from 'chai';
import { components, plays } from '../../common/database/drizzle/schema/schema.ts';
import dayjs from 'dayjs';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { DrizzlePlayRepository, type RepositoryCreatePlayOpts } from '../../common/database/drizzle/repositories/PlayRepository.ts';
import { generateRandomObj } from '../../../core/tests/utils/fixtures.ts';
import { generateArray } from '../../../core/DataUtils.ts';
import { objectsEqual } from '../../utils/DataUtils.ts';
import { sql } from 'drizzle-orm';
import clone from 'clone';
import { transientDb } from '../utils/TransientTestUtils.ts';

describe('Repository Operations', function () {

    it('creates Plays and inputs', async function () {

        const db = await transientDb();

        const component = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db, { componentId: component[0].id });

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

        const db = await transientDb();
        const component = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db, { componentId: component[0].id });

        const numPlays = 3;

        const playData = generateArray<RepositoryCreatePlayOpts>(numPlays, () => ({
            ...fixtureCreatePlay(),
            state: 'queued',
            input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
        }));
        const discovered = {
            ...fixtureCreatePlay(),
            state: 'discovered' as const,
            input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
        };
        playData.push(discovered)

        await repo.createPlays(playData);

        const plays = await repo.findPlays({ state: ['discovered'] });
        expect(plays).length(1);
        expect(plays[0].play.data.track).eq(discovered.play.data.track);
    });

    it('finds Plays by date range', async function () {

        const db = await transientDb();

        const component = await db.insert(components).values(fixtureCreateComponent()).returning();

        const repo = new DrizzlePlayRepository(db, { componentId: component[0].id });

        const playData: RepositoryCreatePlayOpts[] = [
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(2, 'm') }) }),
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(6, 'm') }) }),
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(8, 'm') }) }),
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({ playDate: dayjs().subtract(10, 'm') }) }),
                state: 'queued' as const,
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

        const db = await transientDb();

        const component1 = await db.insert(components).values(fixtureCreateComponent()).returning();
        const component2 = await db.insert(components).values(fixtureCreateComponent({ uid: 'test2', name: 'jelly2' })).returning();
        const component3 = await db.insert(components).values(fixtureCreateComponent({ uid: 'test3', name: 'jelly3' })).returning();

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
                componentId: component3[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay(),
                componentId: component3[0].id,
                state: 'queued' as const,
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

        const db = await transientDb();

        const component1 = await db.insert(components).values(fixtureCreateComponent()).returning();
        const component2 = await db.insert(components).values(fixtureCreateComponent({ uid: 'test2', name: 'jelly2' })).returning();

        const repo = new DrizzlePlayRepository(db);

        const playData: RepositoryCreatePlayOpts[] = [
            {
                ...fixtureCreatePlay({ play: generatePlay({}, { seenAt: dayjs().subtract(25, 'h') }) }),
                componentId: component1[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({}, { seenAt: dayjs().subtract(26, 'h') }) }),
                componentId: component1[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({}, { seenAt: dayjs().subtract(26, 'h') }) }),
                componentId: component2[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
            {
                ...fixtureCreatePlay({ play: generatePlay({}, { seenAt: dayjs().subtract(25, 'h').subtract(1, 'm') }) }),
                componentId: component1[0].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
        ]

        const initialPlays = await repo.createPlays(playData);

        const childPlays = await repo.createPlays([
            {
                ...fixtureCreatePlay({ play: generatePlay({}, { seenAt: dayjs().subtract(25, 'h') }) }),
                componentId: component2[0].id,
                parentId: initialPlays[1].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            },
        ])

        // does not return newer plays
        expect((await repo.findPurgablePlayIds(dayjs().subtract(27, 'h'), { componentId: 1 }))).length(0);

        const pPlays = await repo.findPurgablePlayIds(dayjs().subtract(24, 'h'), { componentId: 1 });
        // only returns plays that do not have children
        expect(pPlays).length(2);
        expect(pPlays[0]).to.eq(initialPlays[0].id);
        expect(pPlays[1]).to.eq(initialPlays[3].id);

        // only finds plays by component
        // and allows purging if they have parent id
        const p2Plays = await repo.findPurgablePlayIds(dayjs().subtract(23, 'h'), { componentId: 2 });
        expect(p2Plays).length(2);
        expect(p2Plays[0]).to.eq(initialPlays[2].id);
        expect(p2Plays[1]).to.eq(childPlays[0].id);
    });

    describe('checkExisting', function () {

        it('finds a Play by parent id and matching parent hash', async function () {

            const db = await transientDb();

            // Component A - "source" plays
            const componentA = await db.insert(components).values(fixtureCreateComponent()).returning();
            const repoA = new DrizzlePlayRepository(db, { componentId: componentA[0].id });

            const playDataA = generateArray<RepositoryCreatePlayOpts>(3, () => ({
                ...fixtureCreatePlay(),
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            }));

            const rowsA = await repoA.createPlays(playDataA);

            // a clone of one of the previously created plays (PlayObject only, not the db row)
            const clonedPlay = clone(playDataA[1].play);

            // Component B - a "client" play that is a child of the Component A play the clone is based off of.
            // Its own content (and therefore its own playHash) differs from the source play - it can only be
            // matched back to the incoming clone through the parent relationship + the parent's frozen hash.
            const componentB = await db.insert(components).values(fixtureCreateComponent({ uid: 'componentB', name: 'componentB' })).returning();
            const repoB = new DrizzlePlayRepository(db, { componentId: componentB[0].id });

            const childPlay = clone(playDataA[1].play);
            childPlay.data.track = `${childPlay.data.track} (transformed)`;

            const rowsB = await repoB.createPlays([{
                ...fixtureCreatePlay({ play: childPlay }),
                parentId: rowsA[1].id,
                state: 'queued' as const,
                input: { data: generateRandomObj(undefined, { allowUndefined: false }) }
            }]);

            // sanity: without a parentId the transformed client play cannot be matched from the source clone
            expect(await repoB.checkExisting(clonedPlay)).to.be.undefined;
            // sanity: passing the id of a different parent play does not match
            expect(await repoB.checkExisting(clonedPlay, { parentId: rowsA[0].id })).to.be.undefined;

            const existing = await repoB.checkExisting(clonedPlay, { parentId: rowsA[1].id });

            expect(existing, 'checkExisting should return the client play whose parent the clone is based off of').to.not.be.undefined;
            expect(existing.id).eq(rowsB[0].id);
            expect(existing.play.data.track).eq(childPlay.data.track);
        });

    });


    it('Get json property from play', async function () {

        const db = await transientDb();

        try {

            const component = await db.insert(components).values(fixtureCreateComponent()).returning();

            const playRows = await db.insert(plays).values([
                fixtureCreatePlay({ componentId: component[0].id, play: generatePlay({}, { source: 'test1' }) }),
                fixtureCreatePlay({ componentId: component[0].id, play: generatePlay({}, { source: 'test2' }) })
            ]).returning();

            // https://github.com/drizzle-team/drizzle-orm/discussions/938#discussioncomment-6542336
            const result = await db.query.plays.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                {
                                    RAW: (p) => sql`lower(json_extract(${p.play}, '$.data.track')) LIKE '%'|| ${playRows[0].play.data.track.substring(0, 5).toLocaleLowerCase()} || '%'`
                                }
                            ]
                        }
                    ]
                }
            });

            // await db.select().from(plays).where(
            //     sql`json_extract(${plays.play}, '$.meta.source') = 'test1'`
            // );

            expect(result).length(1);
            expect(result[0].play.meta.source).eq('test1');

        } catch (e) {
            throw e;
        }
        db.$client.close();
    });

});