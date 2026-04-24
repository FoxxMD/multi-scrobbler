import { configDir } from '../index.js';
import * as path from 'path';
import { promises as fs } from 'fs'
import { childLogger, Logger } from '@foxxmd/logging';
import { loggerNoop } from '../MaybeLogger.js';
import { fileExists, fileOrDirectoryIsWriteable } from '../../utils/FSUtils.js';
import { DEFAULT_RETENTION_DELETE_AFTER, RententionGranular, RetentionOptions, RetentionOptionsFull } from '../infrastructure/config/database.js';
import { DurationValue } from '../infrastructure/Atomic.js';
import { Duration } from 'dayjs/plugin/duration.js';
import dayjs from 'dayjs';
import { parseDurationFromDurationValue } from '../../utils/TimeUtils.js';

export const MEMORY_DB_NAME = ':memory:';
export const isMemoryDb = (name: string): boolean => name === MEMORY_DB_NAME;

export const getDbPath = (name: string = 'ms', workingDirectory?: string): string => {
    if (isMemoryDb(name)) {
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
        const backupPath = `${getDbPath(`${Date.now()}-${dbName}`, workingDirectory)}.bak`;
        logger.info(`Backing up database before migrating => ${backupPath}`);
        await fs.copyFile(dbPath, backupPath)
        logger.info('Backed up!');
    }
}

const parseRetentionFromEnv = (): Required<RententionGranular<Duration>> => {
    const deleteAfterEnv = process.env.RETENTION_DELETE_AFTER ?? DEFAULT_RETENTION_DELETE_AFTER,
        deleteCompletedEnv = process.env.RETENTION_DELETE_COMPLETED_AFTER ?? deleteAfterEnv,
        deleteFailedEnv = process.env.RETENTION_DELETE_FAILED_AFTER ?? deleteAfterEnv,
        deleteDupedEnv = process.env.RETENTION_DELETE_DUPED_AFTER ?? deleteAfterEnv;

    return {
        completed: parseDurationFromDurationValue(deleteCompletedEnv),
        failed: parseDurationFromDurationValue(deleteFailedEnv),
        duped: parseDurationFromDurationValue(deleteDupedEnv)
    }
}

let retentionFromEnv: Required<RententionGranular<Duration>>;
const getRetentionFromEnv = () => {
    if (retentionFromEnv === undefined) {
        retentionFromEnv = parseRetentionFromEnv();
    }
    return retentionFromEnv;
}

export const parseRetentionOptions = (opts: RetentionOptions<DurationValue> = {}): RetentionOptionsFull => {
    if (typeof opts.deleteAfter === 'number' || typeof opts.deleteAfter === 'string') {
        const dur = parseDurationFromDurationValue(opts.deleteAfter);
        return {
            deleteAfter: {
                completed: dur,
                duped: dur,
                failed: dur
            }
        }
    }

    const fromEnv = getRetentionFromEnv();
    if (opts.deleteAfter === undefined) {
        return {
            deleteAfter: fromEnv
        }
    }

    const {
        deleteAfter: {
            completed = fromEnv.completed,
            failed = fromEnv.failed,
            duped = fromEnv.duped
        } = {}
    } = opts;

    return {
        deleteAfter: {
            completed: dayjs.isDuration(completed) ? completed : parseDurationFromDurationValue(completed),
            failed: dayjs.isDuration(failed) ? failed : parseDurationFromDurationValue(failed),
            duped: dayjs.isDuration(duped) ? duped : parseDurationFromDurationValue(duped),
        }
    }
}