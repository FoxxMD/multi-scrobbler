import { describe, it } from 'mocha';
import { expect } from 'chai';
import { loggerTest } from '@foxxmd/logging';
import { sql } from 'drizzle-orm';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import type { PlayObject } from '../../../core/PlaySchema.ts';
import { up } from '../../common/database/appMigrations/010_stringDeviceId.ts';
import { components, plays, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generatePlayEntity, generatePlayHistoricalEntity } from '../../common/database/drizzle/entityUtils.ts';
import { fixtureCreateComponent } from '../utils/databaseFixtures.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';

const numericDevicePlay = (deviceId: string | number) => {
    const generated = generatePlay();
    const meta = {...generated.meta, deviceId};
    return {...generated, meta, original: {play: {data: generated.data, meta}}} as unknown as PlayObject;
}

describe('String deviceId migration', function () {

    it('converts numeric deviceId of stored plays so they load', async function () {
        const db = await transientDb();
        const [source] = await db.insert(components).values(fixtureCreateComponent({mode: 'source', type: 'subsonic', uid: 'subsonic', name: 'subsonic'})).returning();
        await db.insert(plays).values([
            generatePlayEntity(numericDevicePlay(1), {componentId: source.id}),
            generatePlayEntity(numericDevicePlay('abc'), {componentId: source.id}),
        ]);
        await db.insert(playsHistorical).values(generatePlayHistoricalEntity(numericDevicePlay(2), {componentId: source.id}));

        await expect(db.select().from(plays)).to.be.rejected;

        const ctx = {db, logger: loggerTest};
        await up(db.$client, ctx);
        // idempotent
        await up(db.$client, ctx);

        const rows = await db.select().from(plays).orderBy(plays.id);
        expect(rows.map(x => x.play.meta.deviceId)).eql(['1', 'abc']);
        expect(rows.map(x => x.play.original?.play?.meta.deviceId)).eql(['1', 'abc']);
        const historical = await db.select().from(playsHistorical);
        expect(historical[0].play.meta.deviceId).eq('2');
        const raw = await db.all<{t: string}>(sql`select json_type(play, '$.meta.deviceId') as t from plays`);
        expect(raw.map(x => x.t)).eql(['text', 'text']);
    });
});
