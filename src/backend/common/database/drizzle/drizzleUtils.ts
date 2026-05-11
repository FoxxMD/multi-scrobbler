import { drizzle } from 'drizzle-orm/node-sqlite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { PGlite, PGliteOptions } from '@electric-sql/pglite';
import { sql as dsl, LogWriter, Logger as DrizzleLogger } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { backupDb, getDbBackupPath, getDbPath, MEMORY_DB_NAME } from '../Database.js';
import { fileExists, fileOrDirectoryIsWriteable } from '../../../utils/FSUtils.js';
import { childLogger, Logger, LogLevel } from '@foxxmd/logging';
import { loggerNoop } from '../../MaybeLogger.js';
import { projectDir } from '../../index.js';
import { relations } from './schema/schema.js';
import { addToContext, executeQuery } from './logContext.js';

export async function shouldBackupDb(dbVal: string | DbConcrete, opts: {logger?: Logger, migrationsFolder?: string} = {}): Promise<[boolean, string[]]> {
  const {
    logger: parentLogger = loggerNoop,
    migrationsFolder = path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations')
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');

  let db: DbConcrete;
  
  if(typeof dbVal === 'string') {
    logger.info(`Checking for database at ${dbVal}`);
    if (dbVal !== MEMORY_DB_NAME && !fileExists(dbVal)) {
      logger.info(`No database exists, no backup needed.`);
      return [false, []];
    }
    db = await getDb(dbVal);
  } else {
    db = dbVal;
  }


  // const db = drizzlePglite(dbPath);

  try {
    // Ensure the migrations table exists
    // https://github.com/drizzle-team/drizzle-orm/issues/1953
    const res = await db.execute(dsl`
      SELECT EXISTS (
    SELECT FROM 
        pg_tables
    WHERE 
        schemaname = 'drizzle' AND 
        tablename  = '__drizzle_migrations'
    );
      `);

    // const res3 = await db.execute(dsl`
    // SELECT * FROM 
    //     pg_tables;
    //   `);

    if (res.rows[0].exists === false) {
      logger.info(`Database exists but there is no __drizzle_migrations table??`);
      return [true, []];
    }

    const dbMigrations = await db.execute(dsl`SELECT id, hash, created_at, name, applied_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC`);
    // @ts-ignore
    const appliedMigrations = new Set(dbMigrations.rows.map((m: any) => m.name));

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

export const getDb = async (dbVal: string | PGlite, opts: { logger?: Logger, backupPath?: string, loadDataDir?: Promise<Blob> } = {}) => {
  const {
    logger = loggerNoop,
    backupPath,
    loadDataDir
  } = opts;
  let client: PGlite;

  if(typeof dbVal === 'string') {
    const opts: PGliteOptions = {};
    if(dbVal !== MEMORY_DB_NAME) {
      opts.dataDir = dbVal;
      if(backupPath !== undefined) {
        opts.loadDataDir = new Blob([fsSync.readFileSync(backupPath)]);
      }
    }
    // only load one
    // but this could be for a memory db so don't put it in above if
    if(loadDataDir !== undefined && backupDb === undefined) {
      opts.loadDataDir = await loadDataDir
    }
    client = await PGlite.create(opts);
  } else {
    client = dbVal;
  }
  return drizzlePglite({relations: relations, logger: createDrizzleLogger(logger), client});
}

export type DbConcrete = Awaited<ReturnType<typeof getDb>>;

export const migrateDb = async (db: DbConcrete, opts: {logger?: Logger, migrationsFolder?: string} = {}) => {
  const {
    migrationsFolder,
    logger: parentLogger = loggerNoop
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');

  try {
    logger.info('Starting migrations...');
    await executeQuery('migrations', async () => migratePglite(db, { migrationsFolder: migrationsFolder ?? path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations') }), logger, process.env.LOG_MIGRATION === 'true' ? true : 'error');
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
    migrate(db, { migrationsFolder: migrationsFolder ?? path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations') });
    logger.info('Migrations complete');
  } catch (e) {
    throw new Error('Failed to migrate database', { cause: e });
  }
}

export const getMigratedDb = async (dbPath: string, opts: { logger?: Logger, workingDirectory?: string, migrationsFolder?: string, backupPath?: string, loadDataDir?: Promise<Blob> } = {}): Promise<[DbConcrete, boolean]> => {
  const {
    logger = loggerNoop
  } = opts;
  let db: DbConcrete,
  isNew = false,
  hasPendingMigrations: boolean = true;
  if (dbPath !== MEMORY_DB_NAME) {
    try {
      fileOrDirectoryIsWriteable(dbPath);
    } catch (e) {
      throw new Error('Database directory is not accessible', { cause: e });
    }

    const backupPath = getDbBackupPath(dbPath);

    if (fileExists(dbPath)) {
      db = await getDb(dbPath, opts);
      const [shouldBackup, pendingMigrations] = await shouldBackupDb(db, opts);
      if (shouldBackup) {
        hasPendingMigrations = true;
        await backupPgDb(db, dbPath, { logger: opts.logger });
      }
    } else if(fileExists(backupPath)) {
      logger.info(`Detected no database, using backup to recreate db. Backup file: ${backupPath}`);
      db = await getDb(dbPath, {...opts, backupPath});
      const usedBackedPath = getDbBackupPath(dbPath, 'used');
      logger.info(`Backup loaded! Renaming backup to indicate it has already been used, new path: ${usedBackedPath}`);
      await fs.rename(backupPath, usedBackedPath);
    } else {
      logger.info('Detected no database, creating a new one...');
      db = await getDb(dbPath, opts);
      isNew = true;
    }
  } else {
    logger.info('Detected in-memory database');
    db = await getDb(dbPath, opts);
    isNew = true;
  }

  if(hasPendingMigrations && dbPath !== MEMORY_DB_NAME) {
    logger.info('TIP: Migrations may take some time, depending on the size of your database');
  }
  await migrateDb(db, opts);

  return [db, isNew];
}

export const backupPgDb = async (db: DbConcrete, dbPath: string, opts: { logger?: Logger } = {}): Promise<void> => {

    const {
        logger: parentLogger = loggerNoop,
    } = opts;

    const logger = childLogger(parentLogger, 'Backup');

    const pathInfo = path.parse(dbPath);
    // being extra sure there isn't a trailing slash
    const backupPath = `${path.join(pathInfo.dir, pathInfo.name)}-${Date.now()}.bak`;
    logger.info(`Backing up database before migrating => ${backupPath}`);
    fs.writeFile(backupPath, Buffer.from(await (await db.$client.dumpDataDir()).arrayBuffer()));
    //await fs.copyFile(dbPath, backupPath)
    logger.info('Backed up!');
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