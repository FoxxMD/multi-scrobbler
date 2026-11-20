import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { components, historicalPlayInputs, jobs, plays, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { createTmpDir } from '../utils/tmpDir.ts';
import { queryPlaysRequestSchema } from '../../../core/Api.ts';
import qs from 'qs';
import { DrizzlePlayRepository } from '../../common/database/drizzle/repositories/PlayRepository.ts';

describe('Mirror Repository', function () {

    it('resolves the same mirror for the same account', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const repo = new MirrorRepository(db);
        const a = await repo.findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
        const b = await repo.findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'other name'});
        expect(b.id).eq(a.id);
    });

    it('always creates a new mirror for a null account', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const repo = new MirrorRepository(db);
        const a = await repo.findOrCreate({userId: owner.id, service: 'lastfm', account: null, name: 'file'});
        const b = await repo.findOrCreate({userId: owner.id, service: 'lastfm', account: null, name: 'file'});
        expect(b.id).not.eq(a.id);
    });

    it('adds coverage and computes gaps', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const repo = new MirrorRepository(db);
        const m = await repo.findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
        await repo.addCoverage(m.id, [100, 200]);
        await repo.addCoverage(m.id, [201, 300]);
        expect((await repo.getById(m.id))!.coverage).to.deep.eq([[100, 300]]);
        expect(await repo.getGaps(m.id, [0, 400])).to.deep.eq([[0, 99], [301, 400]]);
    });

    it('tags coverage segments and removes them with coverage', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const repo = new MirrorRepository(db);
        const m = await repo.findOrCreate({userId: owner.id, service: 'mixed', account: null, name: 'mixed'});
        await repo.addCoverage(m.id, [100, 200], {origin: 'lastfm', jobId: null});
        await repo.addCoverage(m.id, [150, 300], {origin: 'lz', jobId: null});
        let mirror = (await repo.getById(m.id))!;
        expect(mirror.coverage).to.deep.eq([[100, 300]]);
        expect(mirror.segments).to.deep.eq([{range: [100, 200], origin: 'lastfm', jobId: null}, {range: [201, 300], origin: 'lz', jobId: null}]);
        await repo.removeCoverage(m.id, [180, 220]);
        mirror = (await repo.getById(m.id))!;
        expect(mirror.coverage).to.deep.eq([[100, 179], [221, 300]]);
        expect(mirror.segments).to.deep.eq([{range: [100, 179], origin: 'lastfm', jobId: null}, {range: [221, 300], origin: 'lz', jobId: null}]);
    });
});

describe('Play Historical Repository - mirror inserts', function () {

    const setup = async () => {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
        return {db, mirror, repo: new DrizzlePlayHistoricalRepository(db)};
    }

    it('skips rows whose uid already exists', async function () {
        const {db, mirror, repo} = await setup();
        const rows = [
            {uid: `m${mirror.id}:1:a`, mirrorId: mirror.id, play: generatePlay()},
            {uid: `m${mirror.id}:2:b`, mirrorId: mirror.id, play: generatePlay()},
        ];
        expect(await repo.insertIgnoreDuplicates(rows)).eq(2);
        expect(await repo.insertIgnoreDuplicates([...rows, {uid: `m${mirror.id}:3:c`, mirrorId: mirror.id, play: generatePlay()}])).eq(1);
        expect(await db.select().from(playsHistorical)).length(3);
    });

    it('creates inputs only for inserted rows, matched by uid', async function () {
        const {db, mirror, repo} = await setup();
        await repo.insertIgnoreDuplicates([{uid: 'x', mirrorId: mirror.id, play: generatePlay(), input: {data: {n: 'x'}}}]);
        await repo.insertIgnoreDuplicates([
            {uid: 'x', mirrorId: mirror.id, play: generatePlay(), input: {data: {n: 'x2'}}},
            {uid: 'y', mirrorId: mirror.id, play: generatePlay(), input: {data: {n: 'y'}}},
        ]);
        const rows = await db.query.playsHistorical.findMany({with: {input: true}});
        const byUid = Object.fromEntries(rows.map(x => [x.uid, x.input?.data]));
        expect(byUid).to.deep.eq({x: {n: 'x'}, y: {n: 'y'}});
    });

    it('attaches the first duplicate input when a batch repeats a uid', async function () {
        const {db, mirror, repo} = await setup();
        await repo.insertIgnoreDuplicates([
            {uid: 'x', mirrorId: mirror.id, play: generatePlay(), input: {data: {n: 'first'}}},
            {uid: 'x', mirrorId: mirror.id, play: generatePlay(), input: {data: {n: 'second'}}},
        ]);
        const rows = await db.query.playsHistorical.findMany({with: {input: true}});
        expect(rows).length(1);
        expect(rows[0].input?.data).to.deep.eq({n: 'first'});
    });

    it('creates no inputs when persistInputs is false', async function () {
        const {db, mirror, repo} = await setup();
        await repo.insertIgnoreDuplicates([{uid: 'x', mirrorId: mirror.id, play: generatePlay(), input: {data: {n: 'x'}}}], {persistInputs: false});
        expect(await db.select().from(historicalPlayInputs)).length(0);
    });

    it('scopes queries by mirror', async function () {
        const {db, mirror, repo} = await setup();
        const owner = await ensureOwner(db);
        const other = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: 'other', name: 'other'});
        await repo.insertIgnoreDuplicates([
            {uid: 'a', mirrorId: mirror.id, play: generatePlay()},
            {uid: 'b', mirrorId: other.id, play: generatePlay()},
        ]);
        expect((await repo.findPlays({mirrorId: other.id})).map(x => x.uid)).to.deep.eq(['b']);
    });
});

describe('Job Repository', function () {

    const setup = async () => {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
        return {db, owner, mirror, repo: new JobRepository(db)};
    }

    it('scopes lookups by user', async function () {
        const {owner, mirror, repo} = await setup();
        const job = await repo.create({userId: owner.id, name: 'job', mirrorId: mirror.id, rangeTo: dayjs()});
        expect(await repo.findByIdForUser(job.id, owner.id)).to.not.be.undefined;
        expect(await repo.findByIdForUser(job.id, 'someone-else')).to.be.undefined;
        expect(await repo.findForUser(owner.id)).length(1);
    });

    it('deleting a job keeps its client plays', async function () {
        const {db, owner, mirror, repo} = await setup();
        const job = await repo.create({userId: owner.id, name: 'job', mirrorId: mirror.id, rangeTo: dayjs()});
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'listenbrainz'})).returning();
        await db.insert(plays).values(fixtureCreatePlay({componentId: component[0].id, state: 'scrobbled', jobId: job.id}));

        await repo.deleteJob(job.id);

        expect(await db.select().from(jobs)).length(0);
        const remaining = await db.select().from(plays);
        expect(remaining).length(1);
        expect(remaining[0].jobId).to.be.null;
    });

    it('filters plays by job from a query string', async function () {
        const {db, owner, mirror, repo} = await setup();
        const job = await repo.create({userId: owner.id, name: 'job', mirrorId: mirror.id, rangeTo: dayjs()});
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'listenbrainz'})).returning();
        await db.insert(plays).values([fixtureCreatePlay({componentId: component[0].id, jobId: job.id}), fixtureCreatePlay({componentId: component[0].id})]);
        const playRepo = new DrizzlePlayRepository(db);

        for (const [jobId, expected] of [['null', null], [job.id, job.id]] as const) {
            const query = queryPlaysRequestSchema.parse(qs.parse(qs.stringify({jobId})));
            expect(query.jobId).eq(expected);
            const found = await playRepo.findPlays({...query, componentId: component[0].id});
            expect(found.map(x => x.jobId)).eql([expected]);
        }
    });

    it('deletes a managed import file but never an unmanaged one', async function () {
        const {owner, mirror, repo} = await setup();
        await using tmp = await createTmpDir('jobFiles');
        const managed = path.join(tmp.path, 'managed.csv');
        const unmanaged = path.join(tmp.path, 'unmanaged.csv');
        await fs.writeFile(managed, 'a');
        await fs.writeFile(unmanaged, 'a');
        const fileOpts = {originalName: 'f.csv', format: 'lastfm-ghan-csv', size: 1} as const;

        const a = await repo.create({userId: owner.id, name: 'a', mirrorId: mirror.id, rangeTo: dayjs(), importFile: {...fileOpts, path: managed, managed: true}});
        const b = await repo.create({userId: owner.id, name: 'b', mirrorId: mirror.id, rangeTo: dayjs(), importFile: {...fileOpts, path: unmanaged, managed: false}});
        await repo.deleteJob(a.id);
        await repo.deleteJob(b.id);

        const exists = async (p: string) => fs.access(p).then(() => true, () => false);
        expect(await exists(managed)).is.false;
        expect(await exists(unmanaged)).is.true;
    });
});
