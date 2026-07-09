import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.ts";
import { getDb, migrateDb } from "../../common/database/drizzle/drizzleUtils.ts";

export const transientCache = () => new MSCache(loggerTest);

export const transientDb = async () => {
    const db = getDb(':memory:');
    await migrateDb(db);
    return db;
}