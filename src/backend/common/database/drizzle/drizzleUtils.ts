import { drizzle } from 'drizzle-orm/node-sqlite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { PGlite } from '@electric-sql/pglite';
import { sql as dsl, LogWriter, Logger as DrizzleLogger } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { backupDb, getDbPath, MEMORY_DB_NAME } from '../Database.js';
import { fileExists, fileOrDirectoryIsWriteable } from '../../../utils/FSUtils.js';
import { childLogger, Logger, LogLevel } from '@foxxmd/logging';
import { loggerNoop } from '../../MaybeLogger.js';
import { projectDir } from '../../index.js';
import { relations } from './schema/schema.js';
import { addToContext, executeQuery } from './logContext.js';

export async function shouldBackupDb(db: DbConcrete, opts: {logger?: Logger, migrationsFolder?: string} = {}): Promise<[boolean, string[]]> {
  const {
    logger: parentLogger = loggerNoop,
    migrationsFolder = path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations')
  } = opts;
  const logger = childLogger(parentLogger, 'Migrations');
  
  // logger.info(`Checking database at ${dbPath}`);
  // if (dbPath !== MEMORY_DB_NAME && !fileExists(dbPath)) {
  //   logger.info(`No database exists!`);
  //   return [false, []];
  // }

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

export const getDb = (dbName: string | PGlite = 'msDb', opts: { logger?: Logger, workingDirectory?: string } = {}) => {
  const {
    workingDirectory,
    logger = loggerNoop,
  } = opts;
  let client: PGlite;

  if(typeof dbName === 'string') {
    const dbPath = getDbPath(dbName, workingDirectory);
    
    if(dbName === MEMORY_DB_NAME) {
      client = new PGlite();
    } else {
      client = new PGlite(dbPath);
    }
  } else {
    client = dbName;
  }
  return drizzlePglite({relations: relations, logger: createDrizzleLogger(logger), client});
}

export type DbConcrete = ReturnType<typeof getDb>;

export const migrateDb = async (db: ReturnType<typeof drizzlePglite>, opts: {logger?: Logger, migrationsFolder?: string} = {}) => {
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

export const performDbMigrationWithBackup = async (dbName: string = 'msDb', opts: { logger?: Logger, workingDirectory?: string, migrationsFolder?: string } = {}) => {
  const dbPath = getDbPath(dbName, opts.workingDirectory);

  if(fileExists(dbPath)) {
    const [shouldBackup, pendingMigrations] = await shouldBackupDb(dbPath, opts);
    if(shouldBackup) {
      await backupPgDb(dbName, opts);
    }
  }


  const db = getDb(dbName, opts);
  await migrateDb(db, opts);
}

export const backupPgDb = async (dbName: string, opts: { logger?: Logger, workingDirectory?: string } = {}): Promise<void> => {

    const {
        logger: parentLogger = loggerNoop,
        workingDirectory
    } = opts;

    const logger = childLogger(parentLogger, 'Migrations');

    const dbPath = getDbPath(dbName, workingDirectory);
    let newDb = false;

    if (dbPath !== MEMORY_DB_NAME) {
        if (!fileExists(dbPath)) {
            logger.info(`Database at ${dbPath} does not exist, will create it.`);
            newDb = true;
        }
        try {
            fileOrDirectoryIsWriteable(dbPath);
        } catch (e) {
            throw new Error('Database path/folder is not writeable, cannot backup database', { cause: e });
        }
    }

    if (dbPath !== MEMORY_DB_NAME && !newDb) {

        let client: PGlite;
        if(dbName === MEMORY_DB_NAME) {
          client = new PGlite();
        } else {
          client = new PGlite(dbName);
        }
        const backupPath = `${getDbPath(`${Date.now()}-${dbName}`, workingDirectory)}.bak`;
        logger.info(`Backing up database before migrating => ${backupPath}`);
        fs.writeFile(backupPath, Buffer.from(await (await client.dumpDataDir()).arrayBuffer()));
        await fs.copyFile(dbPath, backupPath)
        logger.info('Backed up!');
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