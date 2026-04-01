import { createDatabase, WorkmaticDb } from 'workmatic';
import { DatabaseSync } from 'node:sqlite';
import { configDir } from '../index.js';
import * as path from 'path';

export const getJobsDb = (dbName: string = ':memory:'): [WorkmaticDb, DatabaseSync] => {
    let dbPath: string;
    if(dbName === ':memory') {
        dbPath = dbName;
    } else {
        dbPath = path.resolve(configDir, `${dbName}.db`);
    }

    const database = new DatabaseSync(dbPath);
    const db = createDatabase({ db: database });
    database.exec(`CREATE INDEX IF NOT EXISTS playdate ON workmatic_jobs((payload->>'$.data.playDate'))`);
    database.exec(`CREATE INDEX IF NOT EXISTS seenAt ON workmatic_jobs((payload->>'$.meta.seenAt'))`);

    return [db, database];
}