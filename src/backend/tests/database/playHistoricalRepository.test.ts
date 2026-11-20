import { expect } from 'chai';
import { describe, it } from 'mocha';
import { components, historicalPlayInputs, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { fixtureCreateComponent } from '../utils/databaseFixtures.ts';
import { DrizzlePlayHistoricalRepository, playToRepositoryCreatePlayHistoricalOpts } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { baseFormatPlayObj } from '../../utils/PlayTransformUtils.ts';

const rawPlay = (raw: object) => {
    const p = generatePlay();
    return baseFormatPlayObj(raw, {data: p.data, meta: p.meta});
}

describe('Play Historical Repository', function () {

    it('moves raw upstream data into historical_play_inputs', async function () {
        const db = await transientDb();
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'tealfm'})).returning();
        const repo = new DrizzlePlayHistoricalRepository(db, { componentId: component[0].id });

        const raw = {foo: 'bar', nested: {a: 1}};
        await repo.createPlays([playToRepositoryCreatePlayHistoricalOpts({play: rawPlay(raw)})]);

        const rows = await db.query.playsHistorical.findMany({with: {input: true}});
        expect(rows).length(1);
        expect(rows[0].play.original).to.be.undefined;
        expect(rows[0].input).to.not.be.undefined;
        expect(rows[0].input!.data).to.deep.eq(raw);
        expect(rows[0].input!.playHash).to.be.a('string');
    });

    it('creates no input when play has no original', async function () {
        const db = await transientDb();
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'tealfm'})).returning();
        const repo = new DrizzlePlayHistoricalRepository(db, { componentId: component[0].id });

        await repo.createPlays([playToRepositoryCreatePlayHistoricalOpts({play: generatePlay()})]);

        expect(await db.select().from(playsHistorical)).length(1);
        expect(await db.select().from(historicalPlayInputs)).length(0);
    });

    it('finds plays with input when requested', async function () {
        const db = await transientDb();
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'tealfm'})).returning();
        const repo = new DrizzlePlayHistoricalRepository(db, { componentId: component[0].id });

        await repo.createPlays([playToRepositoryCreatePlayHistoricalOpts({play: rawPlay({x: 1})})]);

        const without = await repo.findPlays({});
        expect(without[0].input).to.be.undefined;
        const withInput = await repo.findPlays({}, {withInput: true});
        expect(withInput[0].input?.data).to.deep.eq({x: 1});
    });

    it('deletes only the given plays and cascades their inputs', async function () {
        const db = await transientDb();
        const component = await db.insert(components).values(fixtureCreateComponent({mode: 'client', type: 'tealfm'})).returning();
        const repo = new DrizzlePlayHistoricalRepository(db, { componentId: component[0].id });

        const created = await repo.createPlays([
            playToRepositoryCreatePlayHistoricalOpts({play: rawPlay({n: 1})}),
            playToRepositoryCreatePlayHistoricalOpts({play: rawPlay({n: 2})}),
        ]);
        await repo.deletePlays([created[0].id]);

        const remaining = await db.select().from(playsHistorical);
        expect(remaining.map(x => x.id)).to.deep.eq([created[1].id]);
        const inputs = await db.select().from(historicalPlayInputs);
        expect(inputs.map(x => x.playId)).to.deep.eq([created[1].id]);
    });
});
