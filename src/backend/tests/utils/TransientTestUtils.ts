import { loggerTest } from "@foxxmd/logging";
import { MSCache } from "../../common/Cache.ts";
import { getDb, migrateDb } from "../../common/database/drizzle/drizzleUtils.ts";
import { cpSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { getTempDir } from "../../common/index.ts";
import { nanoid } from "nanoid";

export const transientCache = () => new MSCache(loggerTest);

let blankDb: string,
    testdb: string;

export const transientDb = async () => {
    if(blankDb !== undefined) {
        testdb = resolve(getTempDir(),`${nanoid()}.db`);
        cpSync(blankDb, testdb);
        const db = getDb(testdb);
        return db;
    }
    const db = getDb(':memory:');
    await migrateDb(db);
    return db;
}

export const setBaseDbPath = (path: string) => {
    blankDb = path;
}

export const deleteTestDb = () => {
    if(testdb !== undefined) {
        rmSync(testdb, {force: true});
    }
}
export const deleteBaseDb = () => {
    if(blankDb !== undefined) {
        rmSync(blankDb, {force: true});
    }
}