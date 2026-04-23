import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { sql as dsl } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getDbPath, MEMORY_DB_NAME } from '../Database.js';
import { fileExists } from '../../../utils/FSUtils.js';
import { childLogger, Logger } from '@foxxmd/logging';
import { loggerNoop } from '../../MaybeLogger.js';
import { projectDir } from '../../index.js';
import { relations } from './schema/drizzlePlaysTable.js';

export async function shouldBackupDb(dbPath: string, opts: {parentLogger?: Logger, migrationsFolder?: string} = {}): Promise<[boolean, string[]]> {
  const {
    parentLogger = loggerNoop,
    migrationsFolder = path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations')
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');
  
  logger.info(`Checking database at ${dbPath}`);
  if (dbPath !== MEMORY_DB_NAME && !fileExists(dbPath)) {
    logger.info(`No database exists!`);
    return [false, []];
  }

  const db = drizzle(dbPath);

  try {
    // Ensure the migrations table exists
    // https://github.com/drizzle-team/drizzle-orm/issues/1953
    const res = db.all(dsl`
      SELECT count(*) FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations';
      `);

    if (res[0]['count(*)'] === 0) {
      logger.info(`Database exists but there is no __drizzle_migrations table??`);
      return [true, []];
    }

    const dbMigrations = await db.all(dsl`SELECT id, hash, created_at, name, applied_at FROM "__drizzle_migrations" ORDER BY created_at DESC`);
    const appliedMigrations = new Set(dbMigrations.map((m: any) => m.name));

    const allFiles = await fs.readdir(migrationsFolder);
    const migrationFiles = allFiles
      .sort();

    const pendingMigrations = migrationFiles.filter(file => {
      return !appliedMigrations.has(file);
    });

    //console.log('Applied migrations:', Array.from(appliedMigrations));
    if (pendingMigrations.length > 0) {
      logger.info(`${pendingMigrations.length} pending migrations:\n${pendingMigrations.join('\n')}`);
      return [true, pendingMigrations];
    } else {
      logger.info('No pending migrations.');
      return [false, []];
    }
  } catch (error) {
    logger.error(new Error('Failed to get pending migrations', { cause: error }));
    return [true, []];
  }
}

export const getDb = (dbName: string = 'ms', opts: { logger?: Logger, workingDirectory?: string } = {}) => {
  const {
    workingDirectory,
    logger = loggerNoop
  } = opts;
  const dbPath = getDbPath(dbName, workingDirectory);
  logger.info(`Using database at ${dbPath}`);
  return drizzle(dbPath, {relations: relations});
}

export const migrateDb = async (db: ReturnType<typeof drizzle>, opts: {parentLogger?: Logger, migrationsFolder?: string} = {}) => {
  const {
    migrationsFolder,
    parentLogger = loggerNoop
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');

  try {
    await migrate(db, { migrationsFolder: migrationsFolder ?? path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations') });
    logger.info('Migrations complete');
  } catch (e) {
    throw new Error('Failed to migrate database', { cause: e });
  }
}