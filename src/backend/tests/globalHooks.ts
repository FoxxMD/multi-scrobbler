import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { getTempDir } from '../common/index.ts';
import { deleteBaseDb, deleteTestDb, setBaseDbPath } from './utils/TransientTestUtils.ts';
import { getDb, migrateDb } from '../common/database/drizzle/drizzleUtils.ts';

export const mochaHooks = {
  async beforeAll() {
    mkdirSync(getTempDir(), {recursive: true});
    const baseDbPath = path.resolve(getTempDir(),'base.db');
    setBaseDbPath(baseDbPath);
    const db = getDb(baseDbPath);
    await migrateDb(db);
  },
  afterEach() {
    deleteTestDb();
  },
  afterAll() {
    deleteBaseDb();
  }
};