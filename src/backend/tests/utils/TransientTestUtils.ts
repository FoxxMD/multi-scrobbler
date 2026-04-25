import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.js";
import { getDb, migrateDbSync } from "../../common/database/drizzle/drizzleUtils.js";

export const transientCache = () => new MSCache(loggerTest, { scrobble: { provider: 'memory' }, auth: { provider: 'memory' }, metadata: { provider: 'memory' } });

export const transientDb = () => {
    const db = getDb(':memory:');
    migrateDbSync(db);
    return db;
}