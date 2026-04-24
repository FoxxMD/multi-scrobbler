import { configDir } from '../index.js';
import * as path from 'path';
import { promises as fs } from 'fs'
import { childLogger, Logger } from '@foxxmd/logging';
import { loggerNoop } from '../MaybeLogger.js';
import { fileExists, fileOrDirectoryIsWriteable } from '../../utils/FSUtils.js';

export const MEMORY_DB_NAME = ':memory:';
export const isMemoryDb = (name: string): boolean => name === MEMORY_DB_NAME;

export const getDbPath = (name: string = 'ms', workingDirectory?: string): string => {
    if(isMemoryDb(name)) {
        return MEMORY_DB_NAME;
    }
    return path.resolve(workingDirectory ?? configDir, `${name}.db`);
}

export const backupDb = async (dbName: string, opts: { logger?: Logger, workingDirectory?: string } = {}): Promise<void> => {

    const {
        logger: parentLogger = loggerNoop,
        workingDirectory
    } = opts;

    const logger = childLogger(parentLogger, 'Migrations');

    const dbPath = getDbPath(dbName, workingDirectory);
    let newDb = false;

    if(dbPath !== MEMORY_DB_NAME) {
        if(!fileExists(dbPath)) {
            logger.info(`Database at ${dbPath} does not exist, will create it.`);
            newDb = true;
        }
        try {
            fileOrDirectoryIsWriteable(dbPath);
        } catch (e) {
            throw new Error('Database path/folder is not writeable, cannot backup database', {cause: e});
        }
    }

    if(dbPath !== MEMORY_DB_NAME && !newDb) {
        const backupPath = `${getDbPath(`${Date.now()}-${dbName}`, workingDirectory)}.bak`;
        logger.info(`Backing up database before migrating => ${backupPath}`);
        await fs.copyFile(dbPath, backupPath)
        logger.info('Backed up!');
    }
}