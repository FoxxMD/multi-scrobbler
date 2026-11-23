import { expect } from 'chai';
import { describe, it } from 'mocha';
import { EventEmitter } from "events";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dayjs from 'dayjs';
import { eq } from 'drizzle-orm';
import { loggerTest } from '@foxxmd/logging';
import TealScrobbler from '../../scrobblers/TealfmScrobbler.ts';
import { PlayParkedError } from '../../common/errors/MSErrors.ts';
import { COVERAGE_ORIGIN_DUPE_CHECK, coverageForPlay } from '../../scrobblers/AbstractHistoricalScrobbleClient.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { playToRepositoryCreatePlayHistoricalOpts } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { generatePlayHistoricalEntity } from '../../common/database/drizzle/entityUtils.ts';
import { playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';

const buildTeal = async (account: string | null = 'did:plc:abc') => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-mirror-'));
    const tfm = new TealScrobbler('test',
        {id: `test-${Date.now()}`, name: 'test', data: {identifier: 'test', appPassword: 'test'}},
        {configDir: dataDir, dataDir, localUrl: new URL('https://example.com'), version: 'test'},
        new EventEmitter(),
        loggerTest
    );
    await tfm.buildDatabase();
    fs.rmSync(dataDir, {recursive: true, force: true});
    const t = tfm as any;
    t.getMirrorAccount = () => account ?? undefined;
    const owner = await ensureOwner(t.db);
    t.dbComponent.userId = owner.id;
    return {t, owner, mirrors: new MirrorRepository(t.db)};
}

const until = async (fn: () => boolean, ms = 2000) => {
    const start = Date.now();
    while (!fn()) {
        if (Date.now() - start > ms) {
            throw new Error('timed out');
        }
        await new Promise(r => setTimeout(r, 5));
    }
}

const seed = (t: any, ts: number, mirrorId: number | null = null) => t.db.insert(playsHistorical).values(
    generatePlayHistoricalEntity(generatePlay({playDate: dayjs(ts)}), {componentId: t.dbComponent.id, uid: `rkey${ts}`, mirrorId}));

describe('#tealfm Locked mirror', function () {

    it('moves historical plays into a locked mirror for its account, deletes plays of another account and covers the last full sync', async function () {
        const {t, owner, mirrors} = await buildTeal();
        const other = await mirrors.findOrCreate({userId: owner.id, service: 'tealfm', account: 'did:plc:old', name: 'old account'});
        await seed(t, 100);
        await seed(t, 200);
        await seed(t, 300, other.id);
        t.synced = true;
        t.lastImportSuccess = dayjs(5000);

        await t.useLockedMirror();
        // idempotent, IE on every start
        await t.useLockedMirror();

        const mirror = (await mirrors.getById(t.mirrorId))!;
        expect(mirror).include({service: 'tealfm', account: 'did:plc:abc', userId: owner.id});
        const rows = await t.db.select().from(playsHistorical);
        expect(rows.map((x: any) => [x.uid, x.mirrorId, x.origin])).eql([['rkey100', mirror.id, 'tealfm'], ['rkey200', mirror.id, 'tealfm']]);
        expect(mirror.coverage).eql([[0, 5000]]);
        expect(mirror.segments).eql([{range: [0, 5000], origin: 'tealfm', jobId: null}]);

        await t.createHistoricalPlays([playToRepositoryCreatePlayHistoricalOpts({play: generatePlay({playDate: dayjs(400)}, {playId: 'rkey400'})})]);
        const [added] = await t.db.select().from(playsHistorical).where(eq(playsHistorical.uid, 'rkey400'));
        expect(added).include({mirrorId: mirror.id, origin: 'tealfm', componentId: t.dbComponent.id});
    });

    it('does not cover anything when the last full sync failed', async function () {
        const {t, mirrors} = await buildTeal();
        t.synced = false;
        await t.useLockedMirror();
        expect((await mirrors.getById(t.mirrorId))!.coverage).eql([]);
    });

    it('keeps plays without a mirror when the account DID is not resolved', async function () {
        const {t} = await buildTeal(null);
        await seed(t, 100);
        await t.useLockedMirror();
        expect(t.mirrorId).undefined;
        expect((await t.db.select().from(playsHistorical))[0].mirrorId).eq(null);
    });

    it('counts everything after the last synced range as covered, but nothing after a range only a pass covered', async function () {
        const {t, mirrors} = await buildTeal();
        await t.useLockedMirror();
        await mirrors.addCoverage(t.mirrorId, [500, 600], {origin: COVERAGE_ORIGIN_DUPE_CHECK, jobId: null});
        // no sync yet: after 600 is not covered
        expect(await t.uncoveredRanges([[550, 700]])).eql([[601, 700]]);
        // but plays of the last day are, so live plays are never parked
        expect(await t.uncoveredRanges([[Date.now() - 60_000, Date.now()]])).eql([]);
        await mirrors.addCoverage(t.mirrorId, [0, 100], {origin: 'tealfm', jobId: null});
        expect(await t.uncoveredRanges([[50, 700]])).eql([]);
        await mirrors.addCoverage(t.mirrorId, [1000, 2000], {origin: 'tealfm', jobId: null});
        expect(await t.uncoveredRanges([[50, 5000]])).eql([[101, 499], [601, 999]]);
        expect(await t.uncoveredRanges([[3000, 5000]])).eql([]);
    });

    it('requests made while a pass runs share the next pass, which covers what it mirrored', async function () {
        const {t, mirrors} = await buildTeal();
        await t.useLockedMirror();
        await mirrors.addCoverage(t.mirrorId, [10_000, 20_000], {origin: 'tealfm', jobId: null});
        const passes: unknown[] = [];
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        t.getCarFile = async () => 'car';
        t.parseScrobblesFromCar = async (_file: string, _batch: number, opts: {ranges: unknown}) => {
            passes.push(opts.ranges);
            if (passes.length === 1) {
                await gate;
            }
        };
        const first = t.ensureCoverage([[100, 200]]);
        await until(() => passes.length === 1);
        const later = Promise.all([t.ensureCoverage([[150, 300]]), t.ensureCoverage([[5000, 6000]])]);
        release();
        await Promise.all([first, later]);
        expect(passes).eql([[[100, 200]], [[201, 300], [5000, 6000]]]);
        const mirror = (await mirrors.getById(t.mirrorId))!;
        expect(mirror.coverage).eql([[100, 300], [5000, 6000], [10_000, 20_000]]);
        expect(mirror.segments.filter((x: {origin: string}) => x.origin === COVERAGE_ORIGIN_DUPE_CHECK).length).gte(2);
        await t.ensureCoverage([[120, 250]]);
        expect(passes).length(2);
    });

    it('after a failed pass, parks plays that need one (no retry used) and passes again after the backoff', async function () {
        const {t} = await buildTeal();
        await t.useLockedMirror();
        t.coverageFailureBackoffMs = 150;
        t.getCarFile = async () => 'car';
        let fail = true;
        const startedAt: number[] = [];
        t.parseScrobblesFromCar = async () => {
            startedAt.push(Date.now());
            if (fail) {
                throw new Error('bad CAR');
            }
        };
        await expect(t.ensureCoverage([[100, 200]])).rejectedWith('Could not mirror scrobbles for older plays');
        const old = generatePlay({playDate: dayjs().subtract(1, 'year')});
        fail = false;
        const parked = await t.getSOTScrobblesForPlay(old).catch((e: unknown) => e);
        expect(parked).instanceOf(PlayParkedError);
        await (parked as PlayParkedError).until;
        expect(startedAt[1] - startedAt[0]).gte(140);
    });

    it('parks an older play until a pass covers it, never a recent one', async function () {
        const {t} = await buildTeal();
        await t.useLockedMirror();
        await t.mirrorRepo.addCoverage(t.mirrorId, [dayjs().subtract(1, 'week').valueOf(), dayjs().subtract(1, 'day').valueOf()], {origin: 'tealfm', jobId: null});
        const ensured: unknown[] = [];
        t.ensureCoverage = async (ranges: unknown) => {
            ensured.push(ranges);
        };
        await t.getSOTScrobblesForPlay(generatePlay({playDate: dayjs()}));
        expect(ensured).length(0);
        const old = generatePlay({playDate: dayjs().subtract(1, 'year')});
        const err = await t.getSOTScrobblesForPlay(old).catch((e: unknown) => e);
        expect(err).instanceOf(PlayParkedError);
        await (err as PlayParkedError).until;
        expect(ensured).eql([[coverageForPlay(old)]]);
    });

    it('a pass waits for a running full sync, which can cover its ranges', async function () {
        const {t, mirrors} = await buildTeal();
        await t.useLockedMirror();
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        let syncing = false;
        t.doHydrateHistoricalScrobbles = async () => {
            syncing = true;
            await gate;
            syncing = false;
        };
        const parsedDuringSync: boolean[] = [];
        t.getCarFile = async () => 'car';
        t.parseScrobblesFromCar = async () => {
            parsedDuringSync.push(syncing);
        };
        t.hydrateHistoricalScrobbles();
        await until(() => syncing);
        const ensured = t.ensureCoverage([[100, 200]]);
        await new Promise(r => setTimeout(r, 50));
        expect(parsedDuringSync).eql([]);
        release();
        await ensured;
        await t.importPromise;
        // the full sync covered [0, its start], so the pass had nothing left to do
        expect(parsedDuringSync).eql([]);
        expect((await mirrors.getById(t.mirrorId))!.coverage[0][0]).eq(0);
    });
});
