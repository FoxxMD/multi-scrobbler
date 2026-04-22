import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { shouldBackupDb } from '../../common/database/drizzle/drizzleUtils.js';

    it('Detects pending migrations', async function () {

        const res = await shouldBackupDb();

        expect(res).to.be.undefined;
    
    });