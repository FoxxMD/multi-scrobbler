import path from "path";
import {projectDir} from "./index.js";
import winston, {format, Logger} from "winston";
import {DuplexTransport} from "winston-duplex";
import {asLogOptions, LogConfig, LogInfo, LogLevel, LogOptions} from "./infrastructure/Atomic.js";
import process from "process";
import {fileOrDirectoryIsWriteable} from "../utils.js";
import {ErrorWithCause} from "pony-cause";
import {NullTransport} from 'winston-null';
import 'winston-daily-rotate-file';
import dayjs from "dayjs";

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
        const defaultLevel = process.env.LOG_LEVEL || 'info';
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
            const rotateTransport = new winston.transports.DailyRotateFile({
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

const s = splat();
const SPLAT = Symbol.for('splat')
const errorsFormat = errors({stack: true});
const CWD = process.cwd();

let longestLabel = 3;
export const defaultFormat = (defaultLabel = 'App') => printf(({
                                                                   level,
                                                                   message,
                                                                   labels = [defaultLabel],
                                                                   leaf,
                                                                   timestamp,
                                                                   durationMs,
                                                                   // @ts-ignore
                                                                   [SPLAT]: splatObj,
                                                                   stack,
                                                                   ...rest
                                                               }) => {
    let stringifyValue = splatObj !== undefined ? JSON.stringify(splatObj) : '';
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
        errorsFormat,
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
