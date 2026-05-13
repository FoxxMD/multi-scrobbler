import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.js";
import { getDb, migrateDbSync, migrateDb } from "../../common/database/drizzle/drizzleUtils.js";

export const transientCache = () => new MSCache(loggerTest);

export const transientDb = async () => {
    const db = getDb(':memory:');
    await migrateDb(db);
    return db;
}