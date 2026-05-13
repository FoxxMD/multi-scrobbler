import { DbConcrete } from "./drizzle/drizzleUtils.js";
import { loggerNoop } from "../MaybeLogger.js";
import * as path from 'path';
import { childLogger, Logger } from "@foxxmd/logging";
import { projectDir } from "../index.js";
import { Migrator } from 'sqlite-up';
import { MigrationStatus } from "../infrastructure/Atomic.js";

export const getAppMigrationStatus = async (db: DbConcrete, opts: {logger?: Logger, migrationsAppFolder?: string} = {}): Promise<MigrationStatus> => {
    const {
    logger: parentLogger = loggerNoop,
    migrationsAppFolder = path.resolve(projectDir, 'src/backend/common/database/appMigrations')
    } = opts;
    const logger = childLogger(parentLogger, 'App Migrations');

    const migrator = new Migrator({
        db: db.$client,
        migrationsDir: migrationsAppFolder,
        migrationsTable: '__app_migrations'
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
    migrationsAppFolder = path.resolve(projectDir, 'src/backend/common/database/appMigrations')
    } = opts;
    const logger = childLogger(parentLogger, 'App');

    const migrator = new Migrator({
        db: db.$client,
        migrationsDir: migrationsAppFolder,
        migrationsTable: 'appMigrations'
    });

    migrator.on('migration:applied', function (name: string, batch: number): void {
        logger.verbose(`Migration Applied: "${name}" in batch ${batch}`);
    });

    logger.info('Applying any app migrations...');
    const result = await migrator.apply();

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