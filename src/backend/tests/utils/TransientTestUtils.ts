import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.js";
import { getDb, migrateDbSync } from "../../common/database/drizzle/drizzleUtils.js";

export const transientCache = () => new MSCache(loggerTest);

export const transientDb = () => {
    const db = getDb(':memory:');
    migrateDbSync(db);
    return db;
}