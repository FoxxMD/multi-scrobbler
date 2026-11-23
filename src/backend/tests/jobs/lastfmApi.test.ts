import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { components, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import { LastfmApiImportProvider, type LastfmImportSource } from '../../jobs/lastfm/LastfmApiImportProvider.ts';
import { fixtureCreateComponent } from '../utils/databaseFixtures.ts';

/** Simulates user.getRecentTracks: newest first, `from`/`to` each inclusive or exclusive */
class FakeLastfmApi {
    user: string | undefined = 'foxx';
    calls: {from?: number, to?: number, page?: number}[] = [];
    scrobbles: {uts: number, n: number}[];
    inclusiveTo: boolean;
    inclusiveFrom: boolean;
    onCall?: (n: number) => void;

    constructor(uts: number[], inclusiveTo: boolean, inclusiveFrom = true) {
        this.scrobbles = uts.map((u, n) => ({uts: u, n})).sort((a, b) => b.uts - a.uts || b.n - a.n);
        this.inclusiveTo = inclusiveTo;
        this.inclusiveFrom = inclusiveFrom;
    }

    getRecentTracksWithPagination = async (opts: {from?: number, to?: number, page?: number, limit?: number}) => {
        this.calls.push(opts);
        this.onCall?.(this.calls.length);
        const {from = 0, to = Number.MAX_SAFE_INTEGER, page = 1, limit = 200} = opts;
        const matched = this.scrobbles.filter(x => (this.inclusiveFrom ? x.uts >= from : x.uts > from) && (this.inclusiveTo ? x.uts <= to : x.uts < to));
        const slice = matched.slice((page - 1) * limit, page * limit);
        return {
            recenttracks: {
                track: slice.map(x => ({artist: {name: `Artist ${x.n}`}, name: `Track ${x.n}`, album: {'#text': ''}, date: {uts: `${x.uts}`}})),
                '@attr': {total: `${matched.length}`, totalPages: `${Math.ceil(matched.length / limit)}`, page: `${page}`, perPage: `${limit}`, user: 'foxx'}
            }
        };
    }
}

const timings = {importPageDelay: 0, importRetries: 0, importRetryBase: 1, readyTimeout: 10, readyPoll: 5, emitThrottle: 0};

const runImport = async (api: FakeLastfmApi, opts: {rangeTo?: number, manager?: (m: JobManager) => void, ready?: boolean} = {}) => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const mirrors = new MirrorRepository(db);
    const mirror = await mirrors.findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
    const component = await db.insert(components).values(fixtureCreateComponent({mode: 'source', type: 'lastfm'})).returning();
    const jobs = new JobRepository(db);
    const job = await jobs.create({userId: owner.id, name: 'api', mirrorId: mirror.id, componentFromId: component[0].id, rangeTo: dayjs(opts.rangeTo ?? 2_000_000_000)});
    const source: LastfmImportSource = {api: api as unknown as LastfmImportSource['api'], isReady: () => opts.ready ?? true, name: 'lfm'};
    const newManager = () => new JobManager({db, logger: loggerTest, timings, createProvider: () => new LastfmApiImportProvider(source)});
    const settle = async (m: JobManager) => {
        // @ts-expect-error reading protected task for test
        await m.getRunner(job.id).importTask?.promise;
    }
    let m = newManager();
    opts.manager?.(m);
    await m.startImport(job.id);
    await settle(m);
    return {db, jobs, job, mirrors, mirror, newManager, settle};
}

const randomUts = (count: number) => Array.from({length: count}, (_, i) => 1_000_000 + Math.floor(i * 37.3));

for (const [inclusiveFrom, inclusiveTo] of [[true, true], [true, false], [false, true], [false, false]]) {
    describe(`Last.fm API import provider (from ${inclusiveFrom ? 'inclusive' : 'exclusive'}, to ${inclusiveTo ? 'inclusive' : 'exclusive'})`, function () {

        it('imports every scrobble exactly once across many pages', async function () {
            const uts = randomUts(950);
            const api = new FakeLastfmApi(uts, inclusiveTo, inclusiveFrom);
            const {db, jobs, job, mirrors, mirror} = await runImport(api);
            const done = (await jobs.getById(job.id))!;
            expect(done.importStatus).eq('completed');
            expect(await db.select().from(playsHistorical)).length(950);
            expect(done.imported).eq(950);
            expect(done.importTotal).eq(950);
            expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([[0, 2_000_000_000]]);
            expect(api.calls.every(c => (c.page ?? 1) === 1)).is.true;
        });

        it('pages within a second that has more than one page of scrobbles', async function () {
            const uts = [...randomUts(100), ...Array(450).fill(1_002_000), ...Array(300).fill(1_005_000)];
            const api = new FakeLastfmApi(uts, inclusiveTo, inclusiveFrom);
            const {db, jobs, job, mirrors, mirror} = await runImport(api);
            const done = (await jobs.getById(job.id))!;
            expect(done.importStatus).eq('completed');
            expect(await db.select().from(playsHistorical)).length(850);
            expect(done.importTotal).eq(850);
            expect((await mirrors.getById(mirror.id))!.coverage).to.deep.eq([[0, 2_000_000_000]]);
        });

        it('resumes after shutdown without missing or duplicating scrobbles', async function () {
            const uts = [...randomUts(700), ...Array(250).fill(1_003_000)];
            const api = new FakeLastfmApi(uts, inclusiveTo, inclusiveFrom);
            let first!: JobManager;
            const {db, jobs, job, newManager, settle} = await runImport(api, {manager: (m) => {
                first = m;
                api.onCall = (n) => { if (n === 3) { void first.shutdown(); } };
            }});
            expect((await jobs.getById(job.id))!.importStatus).eq('running');

            api.onCall = undefined;
            const second = newManager();
            await second.resumeAll();
            await settle(second);
            const done = (await jobs.getById(job.id))!;
            expect(done.importStatus).eq('completed');
            expect(await db.select().from(playsHistorical)).length(950);
            expect(done.importTotal).eq(950);
        });
    });
}

describe('Last.fm API import provider readiness', function () {
    it('is not ready until the component is ready and authenticated', async function () {
        const api = new FakeLastfmApi([], true);
        let ready = false;
        const provider = new LastfmApiImportProvider({api: api as unknown as LastfmImportSource['api'], isReady: () => ready, name: 'lfm'});
        let err: unknown;
        try { await provider.ready(); } catch (e) { err = e; }
        expect((err as Error).message).to.include('not ready');
        ready = true;
        api.user = undefined;
        err = undefined;
        try { await provider.ready(); } catch (e) { err = e; }
        expect((err as Error).message).to.include('not authenticated');
        api.user = 'foxx';
        await provider.ready();
    });

    it('fails to start when the Last.fm component is not configured or not Last.fm', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'lastfm', account: 'foxx', name: 'foxx'});
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'source', type: 'lastfm'})).returning();
        const jobs = new JobRepository(db);
        const job = await jobs.create({userId: owner.id, name: 'api', mirrorId: mirror.id, componentFromId: component[0].id, rangeTo: dayjs()});

        const missing = new JobManager({db, logger: loggerTest, timings, resolveComponent: () => undefined});
        let err: unknown;
        try { await missing.startImport(job.id); } catch (e) { err = e; }
        expect((err as Error).message).to.include('not configured');

        const notLastfm = new JobManager({db, logger: loggerTest, timings, resolveComponent: () => ({isReady: () => true})});
        err = undefined;
        try { await notLastfm.startImport(job.id); } catch (e) { err = e; }
        expect((err as Error).message).to.include('not a Last.fm');
    });
});
