import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { sql as dsl, LogWriter, Logger as DrizzleLogger } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { backupDb, getDbPath, MEMORY_DB_NAME } from '../Database.js';
import { fileExists } from '../../../utils/FSUtils.js';
import { childLogger, Logger, LogLevel } from '@foxxmd/logging';
import { loggerNoop } from '../../MaybeLogger.js';
import { projectDir } from '../../index.js';
import { relations } from './schema/schema.js';

export async function shouldBackupDb(dbPath: string, opts: {logger?: Logger, migrationsFolder?: string} = {}): Promise<[boolean, string[]]> {
  const {
    logger: parentLogger = loggerNoop,
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
  } finally {
    if(db.$client.isOpen) {
      db.$client.close();
    }
  }
}

export const getDb = (dbName: string = 'ms', opts: { logger?: Logger, workingDirectory?: string } = {}) => {
  const {
    workingDirectory,
    logger = loggerNoop
  } = opts;
  const dbPath = getDbPath(dbName, workingDirectory);
  logger.info(`Using database at ${dbPath}`);
  return drizzle(dbPath, {relations: relations, logger: createDrizzleLogger(logger)});
}

export type DbConcrete = ReturnType<typeof getDb>;

export const migrateDb = async (db: ReturnType<typeof drizzle>, opts: {logger?: Logger, migrationsFolder?: string} = {}) => {
  const {
    migrationsFolder,
    logger: parentLogger = loggerNoop
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');

  try {
    await migrate(db, { migrationsFolder: migrationsFolder ?? path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations') });
    logger.info('Migrations complete');
  } catch (e) {
    throw new Error('Failed to migrate database', { cause: e });
  }
}

export const performDbMigrationWithBackup = async (dbName: string = 'ms', opts: { logger?: Logger, workingDirectory?: string, migrationsFolder?: string } = {}) => {
  const dbPath = getDbPath(dbName, opts.workingDirectory);

  const [shouldBackup, pendingMigrations] = await shouldBackupDb(dbPath, opts);
  if(shouldBackup) {
    await backupDb(dbName, opts);
  }
  const db = getDb(dbName, opts);
  await migrateDb(db, opts);
}

export const createDrizzleLogger = (parentLogger: Logger, opts: {level?: LogLevel, query?: boolean} = {}): LogWriter & DrizzleLogger => {
  const {
    level = 'trace',
    query = false,
  } = opts;

  const logger = childLogger(parentLogger, 'Drizzle');

  let queryFunc: (query: string, params: unknown[]) => void = (_, __) => {};
  if(query) {
    queryFunc = (query: string, params: unknown[]) => logger[level]({params}, `SQL Query => ${query}`);
  }

  return {
    write(message: string) {
      logger[level](message);
    },
    logQuery: queryFunc
  }
}


// cannot really use transactions right now because async isn't supporting for sqlite
// https://github.com/drizzle-team/drizzle-orm/issues/1472
// https://github.com/drizzle-team/drizzle-orm/issues/2275
// so use this workaround for now
// https://github.com/drizzle-team/drizzle-orm/issues/2275#issuecomment-2496503801
let currentTransaction: null | Promise<void> = null;
export const runTransaction = async <
    T,
    TQueryResult,
    TSchema extends Record<string, unknown> = Record<string, never>
>(
    db: BaseSQLiteDatabase<"sync", TQueryResult, TSchema>,
    executor: () => Promise<T>
) => {
    while (currentTransaction !== null) {
        await currentTransaction;
    }
    let resolve!: () => void;
    currentTransaction = new Promise<void>(_resolve => {
        resolve = _resolve;
    });
    try {
        db.run(dsl.raw(`BEGIN`))

        try {
            const result = await executor();
            await db.run(dsl.raw(`COMMIT`));
            return result;
        } catch (error) {
            await db.run(dsl.raw(`ROLLBACK`));
            throw error;
        }
    } finally {
        resolve();
        currentTransaction = null;
    }
};