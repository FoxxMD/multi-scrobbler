import { getDataDir } from '../index.ts';
import * as path from 'path';
import { childLogger, type Logger } from '@foxxmd/logging';
import { loggerNoop } from '../MaybeLogger.ts';
import { COMPACTABLE, type CompactableProperty, DEFAULT_RETENTION_COMPACT_AFTER, DEFAULT_RETENTION_DELETE_AFTER, type RetentionConfigValueDurationValue, type RetentionConfigValueDuration, type RetentionOptionDuration, type RetentionOptionRetentionValue, type RetentionValue, type RetentionValueUnparsed } from '../infrastructure/config/database.ts';
import dayjs from 'dayjs';
import { parseDurationFromDurationValue } from '../../utils/TimeUtils.ts';
import assert from 'node:assert';
import * as sqlite from 'node:sqlite';
import { parseBoolStrict } from '../../utils.ts';
import { SimpleError } from '../errors/MSErrors.ts';

export const MEMORY_DB_NAME = ':memory:';
export const isMemoryDb = (name: string): boolean => name === MEMORY_DB_NAME;

export const getDbPath = (name: string = 'ms', workingDirectory?: string): string => {
    if (isMemoryDb(name)) {
        return MEMORY_DB_NAME;
    }
    return path.resolve(workingDirectory ?? getDataDir(), `${name}.db`);
}

export const getDbBackupPath = (dbPath: string, suffix?: string): string => {
    const pathInfo = path.parse(dbPath);
    const backupPath = `${path.join(pathInfo.dir, pathInfo.name)}.db${suffix !== undefined ? `.${suffix}` : ''}.bak`;
    return backupPath;
}

export const backupDb = async (db: sqlite.DatabaseSync, dbPath: string, opts: { logger?: Logger, suffix?: string } = {}): Promise<void | Uint8Array> => {

    const {
        logger: parentLogger = loggerNoop,
        suffix = dayjs().unix().toString(),
    } = opts;

    const logger = childLogger(parentLogger, 'Migrations');

    if(dbPath === MEMORY_DB_NAME) {
        // TODO serialize
        return;
    }

    const backupPath = getDbBackupPath(dbPath, suffix);
    logger.info(`Backing up database to => ${backupPath}`);
    await sqlite.backup(db, backupPath, {
        progress: ({totalPages, remainingPages}) => {
            logger.debug(`Backup in progress => ${totalPages - remainingPages} / ${totalPages}`);
        }
    })
    logger.info('Backed up!');
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

const parseRetentionFromEnv = (type: string, defaultVal: number = DEFAULT_RETENTION_DELETE_AFTER): RetentionOptionRetentionValue => {
    const deleteAfterEnv = process.env[`RETENTION_${type}_AFTER`] ?? defaultVal,
        deleteCompletedEnv = process.env[`RETENTION_${type}_COMPLETED_AFTER`] ?? deleteAfterEnv,
        deleteFailedEnv = process.env[`RETENTION_${type}_FAILED_AFTER`] ?? deleteAfterEnv,
        deleteDupedEnv = process.env[`RETENTION_${type}_DUPED_AFTER`] ?? deleteAfterEnv;

    return {
        completed: parseRetentionValue(deleteCompletedEnv),
        failed: parseRetentionValue(deleteFailedEnv),
        duped: parseRetentionValue(deleteDupedEnv)
    }
}

const isRetentionOptionDurations = (val: RetentionOptionRetentionValue): val is RetentionOptionDuration => {
    return dayjs.isDuration(val.completed)
    && dayjs.isDuration(val.duped)
    && dayjs.isDuration(val.failed);
}

let retentionDeleteAfterFromEnv: RetentionOptionDuration,
retentionCompactAfterFromEnv: RetentionOptionRetentionValue;

export const getRetentionDeleteAfterFromEnv = () => {
    if (retentionDeleteAfterFromEnv === undefined) {
        const deleteEnv = parseRetentionFromEnv('DELETE');
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
        const compactEnv = parseRetentionFromEnv('COMPACT', DEFAULT_RETENTION_COMPACT_AFTER);
        retentionCompactAfterFromEnv = compactEnv;
    }
    return retentionCompactAfterFromEnv;
}

export const parseRetentionOptions = (opts: RetentionConfigValueDurationValue = {}, defaults: RetentionOptionRetentionValue): RetentionOptionRetentionValue => {
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

export const parseRetentionOptionsDurations = (opts: RetentionConfigValueDurationValue | RetentionConfigValueDuration = {}, defaults: RetentionOptionDuration): RetentionOptionDuration => {
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