import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.js";
import { getDb, migrateDbSync, migrateDb, DbConcrete } from "../../common/database/drizzle/drizzleUtils.js";
import { getPrepopulatedMemoryPGlite } from "./databaseFixtures.js";
import { PGlite } from "@electric-sql/pglite";

export const transientCache = () => new MSCache(loggerTest);

let baseDb: PGlite;

export const transientDb = async () => {
    if(baseDb === undefined) {
        baseDb = await getPrepopulatedMemoryPGlite();
        await migrateDb(getDb(baseDb));
    }
    const db = getDb((await baseDb.clone()) as Awaited<PGlite>);
    return db;
}