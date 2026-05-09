import { configDir } from '../index.js';
import * as path from 'path';
import { promises as fs } from 'fs'
import { childLogger, Logger } from '@foxxmd/logging';
import { loggerNoop } from '../MaybeLogger.js';
import { fileExists, fileOrDirectoryIsWriteable } from '../../utils/FSUtils.js';
import { COMPACTABLE, compactableProperties, CompactableProperty, DEFAULT_RETENTION_DELETE_AFTER, RententionGranular, RetentionConfig, RetentionConfigValue, RetentionOption, RetentionValue, RetentionValueUnparsed } from '../infrastructure/config/database.js';
import { DurationValue } from '../infrastructure/Atomic.js';
import { Duration } from 'dayjs/plugin/duration.js';
import dayjs from 'dayjs';
import { parseDurationFromDurationValue } from '../../utils/TimeUtils.js';
import assert, { AssertionError } from 'node:assert';
import { parseBoolStrict } from '../../utils.js';
import { SimpleError } from '../errors/MSErrors.js';

export const MEMORY_DB_NAME = ':memory:';
export const isMemoryDb = (name: string): boolean => name === MEMORY_DB_NAME;

export const getDbPath = (name: string = 'msDb', workingDirectory?: string): string => {
    if (isMemoryDb(name)) {
        return MEMORY_DB_NAME;
    }
    return path.resolve(workingDirectory ?? configDir, `${name}`);
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

const parseRetentionValue = (val: RetentionValueUnparsed): RetentionValue => {
    if(typeof val === 'string' || typeof val === 'boolean') {
        try {
            const boolVal = parseBoolStrict(val);
            assert(boolVal === false, 'retention value cannot be true');
            return boolVal;
        } catch (e) {
            // swallow
        }
    } else if(dayjs.isDuration(val)) {
        return val;
    } else {
        return parseDurationFromDurationValue(val);
    }
    throw new SimpleError('retention value be of one: false, number, or string');
}

const parseRetentionFromEnv = (): RetentionOption<RetentionValue> => {
    const deleteAfterEnv = process.env.RETENTION_DELETE_AFTER ?? DEFAULT_RETENTION_DELETE_AFTER,
        deleteCompletedEnv = process.env.RETENTION_DELETE_COMPLETED_AFTER ?? deleteAfterEnv,
        deleteFailedEnv = process.env.RETENTION_DELETE_FAILED_AFTER ?? deleteAfterEnv,
        deleteDupedEnv = process.env.RETENTION_DELETE_DUPED_AFTER ?? deleteAfterEnv;

    return {
        completed: parseRetentionValue(deleteCompletedEnv),
        failed: parseRetentionValue(deleteFailedEnv),
        duped: parseRetentionValue(deleteDupedEnv)
    }
}

const isRetentionOptionDurations = (val: RetentionOption<RetentionValue>): val is RetentionOption<Duration> => {
    return dayjs.isDuration(val.completed)
    && dayjs.isDuration(val.duped)
    && dayjs.isDuration(val.failed);
}

let retentionDeleteAfterFromEnv: RetentionOption<Duration>,
retentionCompactAfterFromEnv: RetentionOption<RetentionValue>;

export const getRetentionDeleteAfterFromEnv = () => {
    if (retentionDeleteAfterFromEnv === undefined) {
        const deleteEnv = parseRetentionFromEnv();
        if(isRetentionOptionDurations(deleteEnv)) {
            retentionDeleteAfterFromEnv = deleteEnv;
        } else {
            throw new SimpleError('retention deleteAfter values from env must all be one of: number or string');
        }
    }
    return retentionDeleteAfterFromEnv;
}
export const getRetentionCompactAfterFromEnv = () => {
    if (retentionCompactAfterFromEnv === undefined) {
        const compactEnv = parseRetentionFromEnv();
        retentionCompactAfterFromEnv = compactEnv;
    }
    return retentionCompactAfterFromEnv;
}

export const parseRetentionOptions = (opts: RetentionConfigValue<DurationValue> = {}, defaults: RetentionOption<RetentionValue>): RetentionOption<RetentionValue> => {
    if (typeof opts === 'number' || typeof opts === 'string') {
        const dur = parseDurationFromDurationValue(opts);
        return {
            completed: dur,
            duped: dur,
            failed: dur
        }
    }

    if (opts === undefined) {
        return defaults;
    }

    if(dayjs.isDuration(opts)) {
        return {
            completed: opts,
            failed: opts,
            duped: opts
        }
    }

    const {
        completed = defaults.completed,
        failed = defaults.failed,
        duped = defaults.duped
    } = opts;

    return {
        completed: parseRetentionValue(completed),
        failed: parseRetentionValue(failed),
        duped: parseRetentionValue(duped),
    }
}

export const parseRetentionOptionsDurations = (opts: RetentionConfigValue<Exclude<RetentionValueUnparsed, false>> = {}, defaults: RetentionOption<Duration>): RetentionOption<Duration> => {
    if (typeof opts === 'number' || typeof opts === 'string') {
        const dur = parseDurationFromDurationValue(opts);
        return {
            completed: dur,
            duped: dur,
            failed: dur
        }
    }

    if(dayjs.isDuration(opts)) {
        return {
            completed: opts,
            failed: opts,
            duped: opts
        }
    }

    if (opts === undefined) {
        return defaults;
    }

    const {
        completed = defaults.completed,
        failed = defaults.failed,
        duped = defaults.duped
    } = opts;

    return {
        completed: dayjs.isDuration(completed) ? completed : parseDurationFromDurationValue(completed),
        failed: dayjs.isDuration(failed) ? failed : parseDurationFromDurationValue(failed),
        duped: dayjs.isDuration(duped) ? duped : parseDurationFromDurationValue(duped),
    }
}

export const isCompactableProperty = (val: string): val is CompactableProperty => val === COMPACTABLE.input || val === COMPACTABLE.transform;