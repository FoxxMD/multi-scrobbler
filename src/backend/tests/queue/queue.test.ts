import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { createDatabase, createClient, createWorker } from 'workmatic';
import { DatabaseSync } from 'node:sqlite';
import { getJobsDb } from '../../common/database/JobDb.js';
import { generatePlay } from '../../../core/PlayTestUtils.js';

chai.use(asPromised);

it('does stuff', async function () {

    const [db, nodeDb] = getJobsDb(':memory:');
    const client = createClient({ db, queue: 'scrobble' });

    const { id } = await client.add(generatePlay());
    console.log(`Job created: ${id}`);
    expect(true).to.eq(true);
});
