import { describe, it } from 'mocha';
import { expect } from 'chai';
import { loggerTest } from '@foxxmd/logging';
import { sql } from 'drizzle-orm';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import type { PlayObject } from '../../../core/PlaySchema.ts';
import { up } from '../../common/database/appMigrations/009_slimAtprotoHistorical.ts';
import { components, historicalPlayInputs, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generateInputEntity, generatePlayHistoricalEntity } from '../../common/database/drizzle/entityUtils.ts';
import { slimHistoricalPlay } from '../../scrobblers/AbstractHistoricalScrobbleClient.ts';
import { fixtureCreateComponent } from '../utils/databaseFixtures.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';

const fatPlay = (url: Record<string, string>) => {
    const generated = generatePlay();
    const play = {...generated, meta: {...generated.meta, user: 'did:plc:abc', url: {web: 'https://atproto.at/viewer?uri=did:plc:abc/fm.teal.feed.play/1', ...url}}};
    return {...play, original: {data: {raw: true}, play}} as unknown as PlayObject;
}

describe('Slim Teal/Rocksky historical plays', function () {

    it('slimHistoricalPlay removes raw data, user and the record url but keeps origin', function () {
        const slim = slimHistoricalPlay(fatPlay({origin: 'https://example.com/track'}));
        expect(slim.original).undefined;
        expect(slim.meta.user).undefined;
        expect(slim.meta.url).eql({origin: 'https://example.com/track'});
        expect(slimHistoricalPlay(fatPlay({})).meta.url).undefined;
    });

    it('migration slims rows of atproto clients only and deletes their inputs', async function () {
        const db = await transientDb();
        const [teal] = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'tealfm', uid: 'teal', name: 'teal'})).returning();
        const [other] = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'maloja', uid: 'maloja', name: 'maloja'})).returning();
        const [webOnly, withOrigin, otherRow] = await db.insert(playsHistorical).values([
            generatePlayHistoricalEntity(fatPlay({}), {componentId: teal.id}),
            generatePlayHistoricalEntity(fatPlay({origin: 'https://example.com/track'}), {componentId: teal.id}),
            generatePlayHistoricalEntity(fatPlay({}), {componentId: other.id}),
        ]).returning({id: playsHistorical.id, playHash: playsHistorical.playHash});
        await db.insert(historicalPlayInputs).values([webOnly.id, otherRow.id].map(playId => generateInputEntity({playId, play: generatePlay(), data: {a: 1}})));

        const ctx = {db, logger: loggerTest};
        await up(db.$client, ctx);
        // idempotent
        await up(db.$client, ctx);

        const rows = await db.all<{id: number, play: string, playHash: string}>(sql`select id, play, playHash from plays_historical order by id`);
        const plays = rows.map(x => JSON.parse(x.play));
        expect(plays[0].original).undefined;
        expect(plays[0].meta.user).undefined;
        expect(plays[0].meta.url).undefined;
        expect(plays[0].data.track).not.undefined;
        expect(plays[1].meta.url).eql({origin: 'https://example.com/track'});
        expect(plays[2].original).not.undefined;
        expect(plays[2].meta.url.web).not.undefined;
        expect(rows[0].playHash).eq(webOnly.playHash);

        const inputs = await db.select().from(historicalPlayInputs);
        expect(inputs.map(x => x.playId)).eql([otherRow.id]);
    });
});
