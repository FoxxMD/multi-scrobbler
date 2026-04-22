import { DatabaseSync } from 'node:sqlite';
import { configDir, projectDir } from '../index.js';
import * as path from 'path';
import { promises as fs } from 'fs'
import {
    Kysely,
    Migrator,
    FileMigrationProvider,
    CamelCasePlugin
} from 'kysely'
import { Database } from './kyselyTypes.js'
import { NodeNativeSqliteDialect } from 'kysely-node-native-sqlite'
import { SqliteDialect } from '@takinprofit/kysely-node-sqlite'
import { childLogger, Logger } from '@foxxmd/logging';
import { loggerNoop } from '../MaybeLogger.js';
import { fileExists, fileOrDirectoryIsWriteable } from '../../utils/FSUtils.js';

export const MEMORY_DB_NAME = ':memory:';
export const isMemoryDb = (name: string): boolean => name === MEMORY_DB_NAME;

export const getDbPath = (name: string): string => {
    if(isMemoryDb(name)) {
        return MEMORY_DB_NAME;
    }
    return path.resolve(configDir, `${name}.db`);
}

export const getDb = (dbName: string = ':memory:'): DatabaseSync => {
    const dbPath = getDbPath(dbName);

    const database = new DatabaseSync(dbPath);

    return database;
}

export const getKyselyDb = (nodeDb: DatabaseSync) => {
    return new Kysely<Database>({
        // https://github.com/Takin-Profit/kysely-node-sqlite
        dialect: new SqliteDialect({
            database: nodeDb,
            mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
            stmntCache: {
                maxSize: 100,
                maxAge: 1000 * 60 * 1 // 1 minutes
            }
        }),
        //dialect: new NodeNativeSqliteDialect(nodeDb),
        plugins: [
            new CamelCasePlugin()
        ]
    });
}

export const backupDb = async (dbName: string, parentLogger: Logger = loggerNoop): Promise<void> => {

    const logger = childLogger(parentLogger, 'Migrations');

    const dbPath = getDbPath(dbName);
    let newDb = false;

    if(dbPath !== MEMORY_DB_NAME) {
        if(!fileExists(dbPath)) {
            logger.info(`Database at ${dbPath} does not exist, will create it.`);
            newDb = true;
        }
        try {
            fileOrDirectoryIsWriteable(dbPath);
        } catch (e) {
            throw new Error('Cannot access database path for migrations', {cause: e});
        }
    }

    if(dbPath !== MEMORY_DB_NAME && !newDb) {
        const backupPath = `${getDbPath(`${Date.now()}-${dbName}`)}.bak`;
        logger.info(`Backing up database before migrating => ${backupPath}`);
        await fs.copyFile(dbPath, backupPath)
        logger.info('Backed up!');
    }
}


export async function migrateToLatest(dbName: string, parentLogger: Logger = loggerNoop) {

    const logger = childLogger(parentLogger, 'Migrations');

    const dbPath = getDbPath(dbName);
    let newDb = false;

    if(dbPath !== MEMORY_DB_NAME) {
        if(!fileExists(dbPath)) {
            logger.info(`Database at ${dbPath} does not exist, will create it.`);
            newDb = true;
        }
        try {
            fileOrDirectoryIsWriteable(dbPath);
        } catch (e) {
            throw new Error('Cannot access database path for migrations', {cause: e});
        }
    }

    const db = getKyselyDb(getDb(dbName));

    const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
            fs,
            path,
            // This needs to be an absolute path.
            migrationFolder: path.join(projectDir, 'src/backend/common/database/migrations'),
        }),
    })

    const m = (await migrator.getMigrations()).filter(x => x.executedAt === undefined);
    if(m.length === 0) {
        logger.info('No pending migrations.');
        await db.destroy();
        return;
    }

    logger.info(`${m.length} pending database migrations`);

    if(dbPath !== MEMORY_DB_NAME && !newDb) {
        const backupPath = `${getDbPath(`${Date.now()}-${dbName}`)}.bak`;
        logger.info(`Backing up database before migrating => ${backupPath}`);
        await fs.copyFile(dbPath, backupPath)
        logger.info('Backed up!');
    }

    logger.verbose('Proceeding with migrations...');

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((it) => {
        if (it.status === 'Success') {
            logger.verbose(`migration "${it.migrationName}" was executed successfully`)
        } else if (it.status === 'Error') {
            logger.error(`failed to execute migration "${it.migrationName}"`)
        }
    })

    if (error) {
        logger.error('failed to migrate')
        logger.error(error);
        throw new Error('Database migrations failed');
    }

    logger.info('Migrations finished.');

    await db.destroy()
}