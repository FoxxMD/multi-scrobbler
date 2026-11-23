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
});
