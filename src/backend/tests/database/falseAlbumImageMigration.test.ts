import { describe, it } from 'mocha';
import { expect } from 'chai';
import { loggerTest } from '@foxxmd/logging';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import type { PlayObject } from '../../../core/PlaySchema.ts';
import { up } from '../../common/database/appMigrations/011_falseAlbumImage.ts';
import { components, plays, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generatePlayEntity, generatePlayHistoricalEntity } from '../../common/database/drizzle/entityUtils.ts';
import { fixtureCreateComponent } from '../utils/databaseFixtures.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';

const albumImagePlay = (image: string | boolean) => {
    const generated = generatePlay();
    const data = {...generated.data, album: {name: 'Album', image}};
    return {...generated, data, original: {play: {data, meta: generated.meta}}} as unknown as PlayObject;
}

describe('False album image migration', function () {

    it('removes boolean album image of stored plays so they load', async function () {
        const db = await transientDb();
        const [source] = await db.insert(components).values(fixtureCreateComponent({mode: 'source', type: 'listenbrainz', uid: 'lz', name: 'lz'})).returning();
        await db.insert(plays).values([
            generatePlayEntity(albumImagePlay(false), {componentId: source.id}),
            generatePlayEntity(albumImagePlay('https://example.com/a.jpg'), {componentId: source.id}),
        ]);
        await db.insert(playsHistorical).values(generatePlayHistoricalEntity(albumImagePlay(false), {componentId: source.id}));

        await expect(db.select().from(plays)).to.be.rejected;

        const ctx = {db, logger: loggerTest};
        await up(db.$client, ctx);
        // idempotent
        await up(db.$client, ctx);

        const rows = await db.select().from(plays).orderBy(plays.id);
        expect(rows.map(x => x.play.data.album)).eql([{name: 'Album'}, {name: 'Album', image: 'https://example.com/a.jpg'}]);
        expect(rows.map(x => x.play.original?.play?.data.album?.image)).eql([undefined, 'https://example.com/a.jpg']);
        const historical = await db.select().from(playsHistorical);
        expect(historical[0].play.data.album).eql({name: 'Album'});
    });
});
