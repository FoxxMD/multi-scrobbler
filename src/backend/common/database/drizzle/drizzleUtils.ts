import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { sql as dsl, type Logger as DrizzleLogger } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MEMORY_DB_NAME } from '../Database.ts';
import { fileExists } from '../../../utils/FSUtils.ts';
import { childLogger, type Logger, type LogLevel } from '@foxxmd/logging';
import { loggerNoop } from '../../MaybeLogger.ts';
import { relations } from './schema/schema.ts';
import { addToContext, executeQuery } from './logContext.ts';
import type {MigrationStatus} from '../../infrastructure/Atomic.ts';
import { projectRootDir } from "../../infrastructure/Atomic.ts";

export async function getDbMigrationStatus(dbVal: string | DbConcrete, opts: {logger?: Logger, migrationsFolder?: string} = {}): Promise<MigrationStatus> {
  const {
    logger: parentLogger = loggerNoop,
    migrationsFolder = path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations')
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');
  
  let db: DbConcrete;
  
  if(typeof dbVal === 'string') {
    logger.info(`Checking for database at ${dbVal}`);
    if (dbVal !== MEMORY_DB_NAME && !fileExists(dbVal)) {
      //logger.info(`No database exists, no backup needed.`);
      return {backupRequired: false, pending: [], reason: 'noDb', log: 'No database exists'};
    }
    db = await getDb(dbVal);
  } else {
    db = dbVal;
  }

  try {
    // Ensure the migrations table exists
    // https://github.com/drizzle-team/drizzle-orm/issues/1953
    const res = db.all(dsl`
      SELECT count(*) FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations';
      `);

    if ((res[0] as Record<string, number>)['count(*)'] === 0) {
      //logger.info(`Database exists but there is no __drizzle_migrations table??`);
      return {backupRequired: true, pending: [], reason: 'missingTable', log: 'Database exists but there is no __drizzle_migrations table'};
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
      //logger.info(`${pendingMigrations.length} pending migrations:\n${pendingMigrations.join('\n')}`);
      return {backupRequired: true, pending: pendingMigrations, log: `${pendingMigrations.length} pending migrations:\n${pendingMigrations.join('\n')}`};
    } else {
      //logger.info('No pending migrations.');
      return {backupRequired: false, pending: [], log: 'No pending migrations'};
    }
  } catch (error) {
    const e = new Error('Failed to get pending migrations', { cause: error });
    logger.error(e);
    return {backupRequired: true, pending: [], error: e};
  }
}

// TODO backup path
export const getDb = (dbVal: string, opts: { logger?: Logger, backupPath?: string } = {}) => {
  const {
    logger = loggerNoop,
  } = opts;
  return drizzle(dbVal, {relations: relations, logger: createDrizzleLogger(logger)});
}

export type DbConcrete = ReturnType<typeof getDb>;

export const migrateDb = async (db: DbConcrete, opts: {logger?: Logger, migrationsFolder?: string} = {}) => {
  const {
    migrationsFolder,
    logger: parentLogger = loggerNoop
  } = opts;
  const logger = childLogger(parentLogger, 'DB');

  try {
    logger.info('Starting migrations...');
    await executeQuery('migrations', async () => migrate(db, { migrationsFolder: migrationsFolder ?? path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations') }), logger, process.env.LOG_MIGRATION === 'true' ? true : 'error');
    logger.info('Migrations complete');
  } catch (e) {
    throw new Error('Failed to migrate database', { cause: e });
  }
}

export const migrateDbSync = (db: ReturnType<typeof drizzle>, opts: {logger?: Logger, migrationsFolder?: string} = {}) => {
  const {
    migrationsFolder,
    logger: parentLogger = loggerNoop
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');

  try {
    logger.info('Starting migrations...');
    migrate(db, { migrationsFolder: migrationsFolder ?? path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations') });
    logger.info('Migrations complete');
  } catch (e) {
    throw new Error('Failed to migrate database', { cause: e });
  }
}
export const createDrizzleLogger = (parentLogger: Logger, opts: {level?: LogLevel} = {}): DrizzleLogger => {
  return {
    logQuery: (query: string, params: unknown[]) => {
      addToContext({sql: query, params})
    }
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