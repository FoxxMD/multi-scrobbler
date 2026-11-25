import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { LockRegistry } from '../../jobs/LockRegistry.ts';
import { MirrorService } from '../../jobs/MirrorService.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { nameToCredit, namesToCredits } from '../../../core/MusicMetadata.ts';
import { BAD_TIMESTAMP_BEFORE_MS, isBadTimestamp, MIRROR_SERVICE_MIXED } from '../../../core/Job.ts';
import { sql } from 'drizzle-orm';

const HOUR = 3_600_000;
// after the bad-timestamp cutoff
const T = Date.UTC(2020, 0, 1);

const setup = async () => {
    const db = await transientDb();
    const owner = await ensureOwner(db);
    const mirrors = new MirrorRepository(db);
    const mirror = await mirrors.findOrCreate({userId: owner.id, service: MIRROR_SERVICE_MIXED, account: null, name: 'a'});
    const other = await mirrors.findOrCreate({userId: owner.id, service: MIRROR_SERVICE_MIXED, account: null, name: 'b'});
    const repo = new DrizzlePlayHistoricalRepository(db);
    const service = new MirrorService({db, logger: loggerTest, locks: new LockRegistry(), emitter: new WildcardEmitter(), isJobActive: () => false});
    let n = 0;
    const insert = (playedAts: number[], track = 'Satisfaction', artist = 'The Rolling Stones', mirrorId = mirror.id) => repo.insertIgnoreDuplicates(playedAts.map(ms => ({
        uid: `m${mirrorId}:${n++}`,
        mirrorId,
        play: generatePlay({track: nameToCredit(track), artists: namesToCredits([artist]), playDate: dayjs(ms)}),
    })));
    return {db, mirror, other, repo, service, insert};
}
const seconds = (start: number, count: number, step = 1000) => Array.from({length: count}, (_, i) => start + i * step);

describe('Mirror data issues', function () {

    it('finds a burst of one track played every second', async function () {
        const {mirror, service, insert} = await setup();
        await insert(seconds(T, 42));
        expect(await service.issueSummary(mirror.id)).to.deep.eq({badTimestamp: 0, bursts: 1, burstPlays: 42, plays: 42});
        const {data, meta} = await service.issueGroups(mirror.id);
        expect(meta.total).eq(1);
        expect(data[0]).to.include({count: 42, firstPlayedAt: T, lastPlayedAt: T + 41_000});
        expect(data[0].tags).to.deep.eq(['burst']);
        expect(data[0].play.data.track?.name).eq('Satisfaction');
        expect(data[0].play.data.playDate?.valueOf()).eq(T);
    });

    it('ignores real repeats, short runs and other artists', async function () {
        const {mirror, service, insert} = await setup();
        // same track every 4 minutes
        await insert(seconds(T, 5, 240_000));
        // a run of 2
        await insert(seconds(T + 10 * HOUR, 2), 'Paint It Black');
        // same track name, a second apart, 3 different artists
        await insert([T + 20 * HOUR], 'Intro', 'A');
        await insert([T + 20 * HOUR + 1000], 'Intro', 'B');
        await insert([T + 20 * HOUR + 2000], 'Intro', 'C');
        expect(await service.issueSummary(mirror.id)).to.deep.eq({badTimestamp: 0, bursts: 0, burstPlays: 0, plays: 0});
        expect((await service.issueGroups(mirror.id)).meta.total).eq(0);
    });

    it('tags bad timestamps, alone and in bursts', async function () {
        const {mirror, service, insert} = await setup();
        await insert(seconds(0, 3));
        await insert([5000, 6000], 'Paint It Black');
        expect(await service.issueSummary(mirror.id)).to.deep.eq({badTimestamp: 5, bursts: 1, burstPlays: 3, plays: 5});
        const {data, meta} = await service.issueGroups(mirror.id);
        expect(meta.total).eq(3);
        expect(data.map(x => [x.tags, x.count, x.firstPlayedAt])).to.deep.eq([
            [['badTimestamp', 'burst'], 3, 0],
            [['badTimestamp'], 1, 5000],
            [['badTimestamp'], 1, 6000],
        ]);
    });

    it('tags plays dated more than a day after they were imported as bad timestamps', async function () {
        const {db, mirror, service, insert} = await setup();
        const now = Date.now();
        // imported now (seenAt), so these are in the future
        await insert([now + 2 * 24 * HOUR], 'Future');
        await insert(seconds(now + 3 * 24 * HOUR, 3), 'Future burst');
        // within a day of being imported, clock differences
        await insert([now + HOUR], 'Soon');
        expect(await service.issueSummary(mirror.id)).to.deep.eq({badTimestamp: 4, bursts: 1, burstPlays: 3, plays: 4});
        // a row without seenAt can't be checked
        await db.run(sql`UPDATE plays_historical SET seenAt = NULL WHERE mirrorId = ${mirror.id}`);
        await insert([T], 'Changes the version');
        expect(await service.issueSummary(mirror.id)).to.deep.eq({badTimestamp: 0, bursts: 1, burstPlays: 3, plays: 3});
    });

    it('isBadTimestamp uses the same rule', function () {
        const seen = Date.UTC(2020, 0, 1);
        expect(isBadTimestamp(BAD_TIMESTAMP_BEFORE_MS - 1, seen)).is.true;
        expect(isBadTimestamp(BAD_TIMESTAMP_BEFORE_MS, seen)).is.false;
        expect(isBadTimestamp(seen + 24 * HOUR, seen)).is.false;
        expect(isBadTimestamp(seen + 24 * HOUR + 1, seen)).is.true;
        expect(isBadTimestamp(seen + 48 * HOUR, null)).is.false;
    });

    it('scopes to the mirror and range, and pages', async function () {
        const {mirror, other, service, insert} = await setup();
        await insert(seconds(T, 3), 'A');
        await insert(seconds(T + 10 * HOUR, 3), 'B');
        await insert(seconds(T + 20 * HOUR, 3), 'C');
        await insert(seconds(T, 3), 'A', 'x', other.id);
        expect((await service.issueSummary(mirror.id)).bursts).eq(3);
        expect((await service.issueSummary(mirror.id, [T + 5 * HOUR, T + 25 * HOUR])).bursts).eq(2);
        const page = await service.issueGroups(mirror.id, {offset: 1, limit: 1});
        expect(page.meta).to.deep.eq({offset: 1, limit: 1, total: 3});
        expect(page.data.map(x => x.play.data.track?.name)).to.deep.eq(['B']);
    });

    it('joins plays at most 2 seconds apart, including ties', async function () {
        const {mirror, service, insert} = await setup();
        // 2000ms gaps join
        await insert([T, T + 2000, T + 4000], 'A');
        // a 2001ms gap splits 2 + 2
        await insert([T, T + 1000, T + 3001, T + 4001], 'B');
        // same second, distinct uids
        await insert([T, T, T], 'C');
        const {data} = await service.issueGroups(mirror.id);
        expect(data.map(x => [x.play.data.track?.name, x.count])).to.deep.eq([['A', 3], ['C', 3]]);
    });

    it('counts bad timestamps of a burst that spans the cutoff', async function () {
        const {mirror, service, insert} = await setup();
        await insert(seconds(BAD_TIMESTAMP_BEFORE_MS - 2000, 4));
        expect(await service.issueSummary(mirror.id)).to.deep.eq({badTimestamp: 2, bursts: 1, burstPlays: 4, plays: 4});
        expect((await service.issueGroups(mirror.id)).data[0].tags).to.deep.eq(['badTimestamp', 'burst']);
    });

    it('cuts bursts at the range edge', async function () {
        const {mirror, service, insert} = await setup();
        await insert(seconds(T, 4));
        expect((await service.issueSummary(mirror.id, [T + 1000, T + 10_000])).bursts).eq(1);
        expect((await service.issueSummary(mirror.id, [T + 2000, T + 10_000])).bursts).eq(0);
    });

    it('never puts plays without a track name in a burst', async function () {
        const {mirror, repo, service} = await setup();
        await repo.insertIgnoreDuplicates(seconds(T, 3).map((ms, i) => {
            const play = generatePlay({playDate: dayjs(ms)});
            play.data.track = undefined;
            play.data.artists = [];
            return {uid: `nameless${i}`, mirrorId: mirror.id, play};
        }));
        expect((await service.issueSummary(mirror.id)).bursts).eq(0);
    });

    it('caches until the mirror plays change', async function () {
        const {mirror, repo, service, insert} = await setup();
        await insert(seconds(T, 3));
        let reads = 0;
        const read = repo.mirrorIssueGroupRows;
        // historicalRepo builds a new repo on every access, so wrap each one to count reads
        const proto = Object.getPrototypeOf(service);
        const getter = Object.getOwnPropertyDescriptor(proto, 'historicalRepo')!.get!;
        Object.defineProperty(service, 'historicalRepo', {get() {
            const r = getter.call(service);
            r.mirrorIssueGroupRows = (args: Parameters<typeof read>[0]) => {
                reads++;
                return read(args);
            };
            return r;
        }});
        await Promise.all([service.issueSummary(mirror.id), service.issueGroups(mirror.id)]);
        await service.issueSummary(mirror.id);
        expect(reads).eq(1);
        await insert(seconds(T + HOUR, 3), 'B');
        expect((await service.issueSummary(mirror.id)).bursts).eq(2);
        expect(reads).eq(2);
    });

    describe('burst skip ids', function () {
        /** playedAt of each skipped play, sorted */
        const skipped = async (repo: Awaited<ReturnType<typeof setup>>['repo'], args: Parameters<typeof repo.burstSkipIds>[0]) =>
            [...(await repo.getPlaysByIds(await repo.burstSkipIds(args))).values()].map(x => x.data.playDate!.valueOf()).sort((a, b) => a - b);

        it('skips every burst play except the first in export order', async function () {
            const {mirror, repo, insert} = await setup();
            await insert(seconds(T, 5));
            await insert(seconds(T + HOUR, 3), 'B');
            // not bursts
            await insert(seconds(T + 2 * HOUR, 2), 'C');
            await insert(seconds(T + 3 * HOUR, 3, 240_000), 'D');
            const range: [number, number] = [0, T + 10 * HOUR];
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'asc'})).to.deep.eq([...seconds(T + 1000, 4), ...seconds(T + HOUR + 1000, 2)]);
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'desc'})).to.deep.eq([...seconds(T, 4), ...seconds(T + HOUR, 2)]);
        });

        it('keeps the first of tied plays by id, like export paging', async function () {
            const {mirror, repo, insert} = await setup();
            await insert([T, T, T]);
            const asc = await repo.burstSkipIds({mirrorId: mirror.id, range: [0, T], order: 'asc'});
            const desc = await repo.burstSkipIds({mirrorId: mirror.id, range: [0, T], order: 'desc'});
            const every = [...new Set([...asc, ...desc])].sort((a, b) => a - b);
            expect(every).length(3);
            // asc keeps the lowest id, desc the highest
            expect(asc).to.have.members([every[1], every[2]]);
            expect(desc).to.have.members([every[0], every[1]]);
        });

        it('only looks at plays in range and in the mirror', async function () {
            const {mirror, other, repo, insert} = await setup();
            await insert(seconds(T, 5));
            await insert(seconds(T, 5), 'Satisfaction', 'The Rolling Stones', other.id);
            // the range cuts the burst to its last 3 plays, so the first of those is kept
            expect(await skipped(repo, {mirrorId: mirror.id, range: [T + 2000, T + 10_000], order: 'asc'})).to.deep.eq([T + 3000, T + 4000]);
            // 2 plays left in range is not a burst
            expect(await skipped(repo, {mirrorId: mirror.id, range: [T + 3000, T + 10_000], order: 'asc'})).to.deep.eq([]);
        });

        it('keepEpoch never skips Epoch Plays', async function () {
            const {mirror, repo, insert} = await setup();
            // an onboarding burst
            await insert(seconds(1000, 5));
            await insert(seconds(T, 4));
            const range: [number, number] = [0, T + HOUR];
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'asc'})).to.deep.eq([...seconds(2000, 4), ...seconds(T + 1000, 3)]);
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'asc', keepEpoch: true})).to.deep.eq(seconds(T + 1000, 3));
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'desc', keepEpoch: true})).to.deep.eq(seconds(T, 3));
        });

        it('keepEpoch only keeps the Epoch Plays of a burst that spans the cutoff', async function () {
            const {mirror, repo, insert} = await setup();
            await insert(seconds(BAD_TIMESTAMP_BEFORE_MS - 2000, 5));
            const range: [number, number] = [0, T];
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'asc', keepEpoch: true})).to.deep.eq(seconds(BAD_TIMESTAMP_BEFORE_MS, 3));
            // desc keeps the newest, the 2 Epoch Plays are kept too
            expect(await skipped(repo, {mirrorId: mirror.id, range, order: 'desc', keepEpoch: true})).to.deep.eq(seconds(BAD_TIMESTAMP_BEFORE_MS, 2));
        });
    });

    describe('epoch burst ids', function () {
        it('finds Epoch Plays in bursts only', async function () {
            const {mirror, other, repo, insert} = await setup();
            await insert(seconds(1000, 5));
            // a single Epoch Play, a burst after the cutoff, and another mirror's onboarding burst
            await insert([HOUR], 'Alone');
            await insert(seconds(T, 4));
            await insert(seconds(1000, 5), 'Satisfaction', 'The Rolling Stones', other.id);
            const ids = await repo.epochBurstIds({mirrorId: mirror.id, range: [0, T + HOUR]});
            expect([...(await repo.getPlaysByIds(ids)).values()].map(x => x.data.playDate!.valueOf()).sort((a, b) => a - b)).to.deep.eq(seconds(1000, 5));
            // cut by the range
            expect(await repo.epochBurstIds({mirrorId: mirror.id, range: [3000, T]})).length(3);
        });
    });
});
