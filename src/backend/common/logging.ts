import { childLogger, FileLogOptions, Logger, loggerAppRolling, LogLevel, LogLevelStreamEntry, LogOptions, parseLogOptions } from '@foxxmd/logging';
import { buildDestinationJsonPrettyStream, buildDestinationRollingFile, buildDestinationStdout, buildLogger } from "@foxxmd/logging/factory";
import { PassThrough, Transform } from "node:stream";
import path from "path";
import process from "process";
import { projectDir } from "./index.js";
import { isDebugMode } from '../utils.js';

export let logPath = path.resolve(projectDir, `./logs`);
if (typeof process.env.CONFIG_DIR === 'string') {
    logPath = path.resolve(process.env.CONFIG_DIR, './logs');
}

export const initLogger = (): [Logger, Transform] => {
    const opts = parseLogOptions({file: false, console: 'debug'})
    const stream = new PassThrough({objectMode: true});
    const logger = buildLogger('debug', [
        buildDestinationStdout(opts.console),
        buildDestinationJsonPrettyStream(opts.console, {destination: stream, object: true, colorize: true})
    ]);
    return [logger, stream];
}

export const appLogger = async (config: LogOptions = {}): Promise<[Logger, PassThrough]> => {
    const stream = new PassThrough({objectMode: true});
    const { file } = config;
    const opts = parseLogOptions(isDebugMode() ? {...config, file: typeof file === 'object' ? {...file, level: 'debug'} : 'debug', console: 'debug', level: 'debug'} : config);
    const logger = await loggerAppRolling(config, {
        logBaseDir: typeof process.env.CONFIG_DIR === 'string' ? process.env.CONFIG_DIR : undefined,
        logDefaultPath: './logs/scrobble.log',
        destinations: [
            buildDestinationJsonPrettyStream(opts.console, {destination: stream, object: true, colorize: true})
        ]
    });
    return [logger, stream];
}

export const componentFileLogger = async (type: string, name: string, fileConfig: true | LogLevel | FileLogOptions, config: LogOptions = {}): Promise<Logger> => {
    const opts = parseLogOptions(config, {
        logBaseDir: typeof process.env.CONFIG_DIR === 'string' ? process.env.CONFIG_DIR : undefined,
        logDefaultPath: './logs/scrobble.log'
    });

    const base = path.dirname(typeof opts.file.path === 'function' ? opts.file.path() : opts.file.path);
    const componentLogPath = path.join(base, `${type}-${name}.log`);

    const componentConfig: LogOptions = {
        level: opts.level ?? 'debug'
    };
    if (fileConfig === true) {
        componentConfig.file = {
            path: componentLogPath,
        }
    } else if (typeof fileConfig === 'string') {
        componentConfig.file = {
            level: fileConfig as LogLevel,
            path: componentLogPath
        }
    } else {
        componentConfig.file = fileConfig;
    }

    const strongOpts = parseLogOptions(componentConfig);

    const streams: LogLevelStreamEntry[] = [];

    if(strongOpts.file.level !== false) {
        const file = await buildDestinationRollingFile(componentConfig.file.level ?? componentConfig.level, {...strongOpts.file})
        streams.push(file);

        return buildLogger('debug' as LogLevel, streams);
    } else {
        throw new Error('File must be set');
    }
}

export class MaybeLogger {
    logger?: Logger

    constructor(logger?: Logger, label?: string) {
        if (logger !== undefined && label !== undefined) {
            this.logger = childLogger(logger, label);
        } else {
            this.logger = logger;
        }
    }

    public info(first: any, ...rest: any) {
        if (this.logger) {
            this.logger.info(first, ...rest);
        }
    }

    public debug(first: any, ...rest: any) {
        if (this.logger) {
            this.logger.debug(first, ...rest);
        }
    }

    public warn(first: any, ...rest: any) {
        if (this.logger) {
            this.logger.warn(first, ...rest);
        }
    }

    public verbose(first: any, ...rest: any) {
        if (this.logger) {
            this.logger.verbose(first, ...rest);
        }
    }

    public error(first: any, ...rest: any) {
        if (this.logger) {
            this.logger.error(first, ...rest);
        }
    }
}
