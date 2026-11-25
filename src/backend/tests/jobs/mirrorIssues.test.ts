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
import { MIRROR_SERVICE_MIXED } from '../../../core/Job.ts';

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
    return {mirror, other, repo, service, insert};
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
});
