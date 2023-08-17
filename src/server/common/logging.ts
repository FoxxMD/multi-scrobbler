import path from "path";
import {projectDir} from "./index.js";
import winston, {format, Logger} from '@foxxmd/winston';
import {DuplexTransport} from "winston-duplex";
import {asLogOptions, LogConfig, LogOptions} from "./infrastructure/Atomic.js";
import process from "process";
import {fileOrDirectoryIsWriteable, parseBool} from "../utils.js";
import {ErrorWithCause, stackWithCauses} from "pony-cause";
import {NullTransport} from 'winston-null';
import DailyRotateFile from 'winston-daily-rotate-file';
import dayjs from "dayjs";
import stringify from 'safe-stable-stringify';
import {SPLAT, LEVEL, MESSAGE} from 'triple-beam';
import {LogInfo, LogLevel} from "../../core/Atomic.js";

const {combine, printf, timestamp, label, splat, errors} = format;


const {transports} = winston;

export let logPath = path.resolve(projectDir, `./logs`);
if (typeof process.env.CONFIG_DIR === 'string') {
    logPath = path.resolve(process.env.CONFIG_DIR, './logs');
}

winston.loggers.add('noop', {transports: [new NullTransport()]});

export const getLogger = (config: LogConfig = {}, name = 'app'): Logger => {

    if (!winston.loggers.has(name)) {
        const errors: (Error | string)[] = [];

        let options: LogOptions = {};
        if (asLogOptions(config)) {
            options = config;
        } else {
            errors.push(`Logging levels were not valid. Must be one of: 'error', 'warn', 'info', 'verbose', 'debug' -- 'file' may be false.`);
        }

        const {level: configLevel} = options;
        const defaultLevel = process.env.LOG_LEVEL || (parseBool(process.env.DEBUG_MODE) ? 'debug' : 'info');
        const {
            level = configLevel || defaultLevel,
            file = configLevel || defaultLevel,
            stream = configLevel || 'debug',
            console = configLevel || 'debug'
        } = options;

        const consoleTransport = new transports.Console({level: console});

        const myTransports = [
            consoleTransport,
            new DuplexTransport({
                stream: {
                    transform(chunk, e, cb) {
                        cb(null, chunk);
                    },
                    objectMode: true,
                },
                name: 'duplex',
                handleExceptions: true,
                handleRejections: true,
                level: stream,
                dump: false,
            }),
        ];

        if (file !== false) {
            const rotateTransport = new DailyRotateFile({
                dirname: logPath,
                createSymlink: true,
                symlinkName: 'scrobble-current.log',
                filename: 'scrobble-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '5m',
                level: file
            });

            try {
                fileOrDirectoryIsWriteable(logPath);
                // @ts-ignore
                myTransports.push(rotateTransport);
            } catch (e: any) {
                let msg = 'WILL NOT write logs to rotating file due to an error while trying to access the specified logging directory';
                errors.push(new ErrorWithCause<Error>(msg, {cause: e}));
            }
        }

        const loggerOptions: winston.LoggerOptions = {
            level: level,
            format: labelledFormat(),
            transports: myTransports,
        };

        winston.loggers.add(name, loggerOptions);

        const logger = winston.loggers.get(name);
        if (errors.length > 0) {
            for (const e of errors) {
                logger.error(e);
            }
        }
        return logger;
    }
    return winston.loggers.get(name);
}

const breakSymbol = '<br />';
export const formatLogToHtml = (chunk: any) => {
    const line = chunk.toString().replace('\n', breakSymbol)
        .replace(/(debug)\s/gi, '<span class="debug blue">$1 </span>')
        .replace(/(warn)\s/gi, '<span class="warn yellow">$1 </span>')
        .replace(/(info)\s/gi, '<span class="info green">$1 </span>')
        .replace(/(verbose)\s/gi, '<span class="verbose purple">$1 </span>')
        .replace(/(error)\s/gi, '<span class="error red">$1 </span>')
        .trim();
    if(line.slice(-6) !== breakSymbol) {
        return `${line}${breakSymbol}`;
    }
    return line;
}

const levelSymbol = Symbol.for('level');
const s = splat();
//const errorsFormat = errors({stack: true});
const CWD = process.cwd();

const causeKeys = ['name',  'cause']

export const defaultFormat = (defaultLabel = 'App') => printf(({
                                                                   label,
                                                                   [levelSymbol]: levelSym,
                                                                   level,
                                                                   message,
                                                                   labels = [defaultLabel],
                                                                   leaf,
                                                                   timestamp,
                                                                   durationMs,
                                                                   [SPLAT]: splatObj,
                                                                   stack,
                                                                   ...rest
                                                               }) => {
    const keys = Object.keys(rest);
    let stringifyValue = keys.length > 0 && !keys.every(x => causeKeys.some(y => y == x)) ? stringify(rest) : '';
    let msg = message;
    let stackMsg = '';
    if (stack !== undefined) {
        const stackArr = stack.split('\n');
        const stackTop = stackArr[0];
        const cleanedStack = stackArr
            .slice(1) // don't need actual error message since we are showing it as msg
            .map((x: string) => x.replace(CWD, 'CWD')) // replace file location up to cwd for user privacy
            .join('\n'); // rejoin with newline to preserve formatting
        stackMsg = `\n${cleanedStack}`;
        if (msg === undefined || msg === null || typeof message === 'object') {
            msg = stackTop;
        } else {
            stackMsg = `\n${stackTop}${stackMsg}`
        }
    }

    let nodes = Array.isArray(labels) ? labels : [labels];
    if (leaf !== null && leaf !== undefined && !nodes.includes(leaf)) {
        nodes.push(leaf);
    }
    const labelContent = `${nodes.map((x: string) => `[${x}]`).join(' ')}`;

    return `${timestamp} ${level.padEnd(8)}: ${labelContent} ${msg}${stringifyValue !== '' ? ` ${stringifyValue}` : ''}${stackMsg}`;
});

export const labelledFormat = (labelName = 'App') => {
    const l = label({label: labelName, message: false});
    return combine(
        timestamp(
            {
                format: () => dayjs().local().format(),
            }
        ),
        l,
        s,
        errorAwareFormat,
        defaultFormat(labelName),
    );
}

export const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    trace: 5,
    silly: 6
};

export const LOG_LEVEL_REGEX: RegExp = /\s*(debug|warn|info|error|verbose)\s*:/i
export const isLogLineMinLevel = (log: string | LogInfo, minLevelText: LogLevel): boolean => {
    // @ts-ignore
    const minLevel = logLevels[minLevelText];
    let level: number;

    if(typeof log === 'string') {
        const lineLevelMatch =  log.match(LOG_LEVEL_REGEX)
        if (lineLevelMatch === null) {
            return false;
        }
        // @ts-ignore
        level = logLevels[lineLevelMatch[1]];
    } else {
        const lineLevelMatch = log.level;
        // @ts-ignore
        level = logLevels[lineLevelMatch];
    }
    return level <= minLevel;
}

const isProbablyError = (val: any, explicitErrorName?: string) => {
    if(typeof val !== 'object' || val === null) {
        return false;
    }
    const {name, stack} = val;
    if(explicitErrorName !== undefined) {
        if(name !== undefined && name.toLowerCase().includes(explicitErrorName)) {
            return true;
        }
        if(stack !== undefined && stack.trim().toLowerCase().indexOf(explicitErrorName.toLowerCase()) === 0) {
            return true;
        }
        return false;
    } else if(stack !== undefined) {
        return true;
    } else if(name !== undefined && name.toLowerCase().includes('error')) {
        return true;
    }

    return false;
}

const errorAwareFormat = {
    transform: (einfo: any, {stack = true}: any = {}) => {

        // because winston logger.child() re-assigns its input to an object ALWAYS the object we recieve here will never actually be of type Error
        const includeStack = stack && (!isProbablyError(einfo, 'simpleerror') && !isProbablyError(einfo.message, 'simpleerror'));

        if (!isProbablyError(einfo.message) && !isProbablyError(einfo)) {
            return einfo;
        }

        let info: any = {};

        if (isProbablyError(einfo)) {
            const tinfo = transformError(einfo);
            info = Object.assign({}, tinfo, {
                // @ts-ignore
                level: einfo.level,
                // @ts-ignore
                [LEVEL]: einfo[LEVEL] || einfo.level,
                message: tinfo.message,
                // @ts-ignore
                [MESSAGE]: tinfo[MESSAGE] || tinfo.message
            });
            if(includeStack) {
                // so we have to create a dummy error and re-assign all error properties from our info object to it so we can get a proper stack trace
                const dummyErr = new ErrorWithCause('');
                const names = Object.getOwnPropertyNames(tinfo);
                for(const k of names) {
                    if(dummyErr.hasOwnProperty(k) || k === 'cause') {
                        // @ts-ignore
                        dummyErr[k] = tinfo[k];
                    }
                }
                // @ts-ignore
                info.stack = stackWithCauses(dummyErr);
            }
        } else {
            const err = transformError(einfo.message);
            info = Object.assign({}, einfo, err);
            // @ts-ignore
            info.message = err.message;
            // @ts-ignore
            info[MESSAGE] = err.message;

            if(includeStack) {
                const dummyErr = new ErrorWithCause('');
                // Error properties are not enumerable
                // https://stackoverflow.com/a/18278145/1469797
                const names = Object.getOwnPropertyNames(err);
                for(const k of names) {
                    if(dummyErr.hasOwnProperty(k) || k === 'cause') {
                        // @ts-ignore
                        dummyErr[k] = err[k];
                    }
                }
                // @ts-ignore
                info.stack = stackWithCauses(dummyErr);
            }
        }

        // remove redundant message from stack and make stack causes easier to read
        if(info.stack !== undefined) {
            let cleanedStack = info.stack.replace(info.message, '');
            cleanedStack = `${cleanedStack}`;
            cleanedStack = cleanedStack.replaceAll('caused by:', '\ncaused by:');
            info.stack = cleanedStack;
        }

        return info;
    }
}

export const transformError = (err: Error): any => _transformError(err, new Set());

const _transformError = (err: Error, seen: Set<Error>) => {
    if (!err || !isProbablyError(err)) {
        return '';
    }
    if (seen.has(err)) {
        return err;
    }

    try {

        // @ts-ignore
        let mOpts = err.matchOptions ?? matchOptions;

        // @ts-ignore
        const cause = err.cause as unknown;

        if (cause !== undefined && cause instanceof Error) {
            // @ts-ignore
            err.cause = _transformError(cause, seen, mOpts);
        }

        return err;
    } catch (e: any) {
        // oops :(
        // we're gonna swallow silently instead of reporting to avoid any infinite nesting and hopefully the original error looks funny enough to provide clues as to what to fix here
        return err;
    }
}
