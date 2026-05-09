import { loggerTest } from '@foxxmd/logging';
import { getRoot } from "../ioc.js";
import { transientCache, transientDb } from './utils/TransientTestUtils.js';
import { DbConcrete, getDb, migrateDb } from '../common/database/drizzle/drizzleUtils.js';

// let transientD: DbConcrete;
// const transientDbFactory = () => {
//     return getDb(transientD.$client.clone())
// }

// export async function mochaGlobalSetup() {
//     transientD = getDb(':memory:');
//     await migrateDb(transientD);

//     const root = getRoot({cache: transientCache, logger: loggerTest, db: transientDb});
//     root.items.cache().init();
// }

const root = getRoot({cache: transientCache, logger: loggerTest, db: transientDb});
root.items.cache().init();