import { loggerNoop } from "../MaybeLogger.ts";
import * as path from 'path';
import { childLogger, type Logger } from "@foxxmd/logging";
import { Migrator } from 'sqlite-up';
import { projectRootDir, type MigrationStatus } from "../infrastructure/Atomic.ts";
import * as fs from "fs/promises";
import { backupDb, getDbBackupPath, MEMORY_DB_NAME } from "./Database.ts";
import { fileExists, fileOrDirectoryIsWriteable } from "../../utils/FSUtils.ts";
import { getDbMigrationStatus, getDb, type DbConcrete, migrateDb } from "./drizzle/drizzleUtils.ts";

export interface MigrateBaseContext {
    db: DbConcrete
    logger: Logger
}

const migrationsTable = '__app_migrations';

export const getAppMigrationStatus = async (db: DbConcrete, opts: {logger?: Logger, migrationsAppFolder?: string} = {}): Promise<MigrationStatus> => {
    const {
    logger: parentLogger = loggerNoop,
    migrationsAppFolder = path.resolve(projectRootDir, 'src/backend/common/database/appMigrations')
    } = opts;
    const logger = childLogger(parentLogger, 'App Migrations');

    const migrator = new Migrator({
        db: db.$client,
        migrationsDir: migrationsAppFolder,
        migrationsTable: migrationsTable
    });

    const status = await migrator.status();

    if(status.pending === 0) {
        return {backupRequired: false, pending: [], log: 'No pending app migrations.'};
    }

    const plan = await migrator.plan();
    return {backupRequired: true, pending: plan.pendingMigrations, log: `${plan.pendingMigrations.length} pending app migrations:\n${plan.pendingMigrations.join('\n')}`};
}


export const migrateApp = async (db: DbConcrete, opts: {logger?: Logger, migrationsAppFolder?: string} = {}): Promise<string[]> => {
    const {
    logger: parentLogger = loggerNoop,
    migrationsAppFolder = path.resolve(projectRootDir, 'src/backend/common/database/appMigrations')
    } = opts;
    const logger = childLogger(parentLogger, ['App', 'Migrations']);

    const migrator = new Migrator<MigrateBaseContext>({
        db: db.$client,
        migrationsDir: migrationsAppFolder,
        migrationsTable: migrationsTable
    });

    migrator.on('migration:applied', function (name: string, batch: number): void {
        logger.verbose(`Migration Applied: "${name}" in batch ${batch}`);
    });

    logger.info('Applying any app migrations...');
    const result = await migrator.apply({db, logger});

    if (!result.success) {
        throw new Error('App migration failed', {cause: result.error});
    } else {
        if(result.appliedMigrations.length === 0) {
            logger.info('No app migrations required.');
        } else {
            logger.info('App migrations applied!');
        }
    }

    return result.appliedMigrations;
}

export const getMigratedDb = async (dbPath: string, opts: { 
  logger?: Logger, 
  migrationsFolder?: string,
  migrationsAppFolder?: string,
  backupPath?: string 
} = {}): Promise<[DbConcrete, boolean]> => {
  const {
    logger: parentLogger = loggerNoop
  } = opts;
  const logger = childLogger(parentLogger, ['Migrations']);
  let db: DbConcrete,
  isNew = false,
  isMemory = dbPath === MEMORY_DB_NAME,
  dbMigrationStatus: MigrationStatus,
  appMigrationStatus: MigrationStatus,
  backedUp = false;
  if (!isMemory) {
    try {
      fileOrDirectoryIsWriteable(dbPath);
    } catch (e) {
      throw new Error('Database directory is not accessible', { cause: e });
    }

    const backupPath = getDbBackupPath(dbPath);

    if(!fileExists(dbPath) && fileExists(backupPath)) {
      logger.info(`Detected no database, making a copy of backup to use as new db. Backup file: ${backupPath}`);
      await fs.copyFile(backupPath, dbPath);
    }
    if (fileExists(dbPath)) {
      db = await getDb(dbPath, opts);
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

  dbMigrationStatus = await getDbMigrationStatus(db, opts);
  if(dbMigrationStatus.error !== undefined) {
    logger.warn(dbMigrationStatus.error);
  } else if(!isMemory && dbMigrationStatus.log !== undefined) {
    logger.info({labels: 'DB'}, dbMigrationStatus.log);
  }
  if (dbMigrationStatus.backupRequired && !isNew && !isMemory) {
    await backupDb(db.$client, dbPath, { logger: opts.logger });
    backedUp = true;
  }

  if(backedUp) {
    logger.info('TIP: Migrations may take some time, depending on the size of your database');
  }
  await migrateDb(db, opts);

  appMigrationStatus = await getAppMigrationStatus(db, opts);
  if(!isMemory && appMigrationStatus.log !== undefined) {
    logger.info({labels: 'App'}, appMigrationStatus.log);
  }
  if(appMigrationStatus.pending.length > 0) {
    if(appMigrationStatus.backupRequired && !isNew && !isMemory && !backedUp) {
      logger.info(`Database not yet backed up, backing up before app migrations`);
      await backupDb(db.$client, dbPath, { logger: opts.logger });
    }
    await migrateApp(db, opts);
  }

  return [db, isNew];
}
