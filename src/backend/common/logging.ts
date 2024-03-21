import path from "path";
import { projectDir } from "./index.js";
import process from "process";
import {
    parseLogOptions,
    loggerAppRolling,
    LogOptions as FoxLogOptions,
    Logger as FoxLogger,
    childLogger, LogLevel, PrettyOptionsExtra,
} from '@foxxmd/logging';
import {PassThrough, Transform} from "node:stream";
import {buildLogger, buildDestinationStdout, buildDestinationJsonPrettyStream} from "@foxxmd/logging/factory";
import {parseBool} from "../utils.js";

export let logPath = path.resolve(projectDir, `./logs`);
if (typeof process.env.CONFIG_DIR === 'string') {
    logPath = path.resolve(process.env.CONFIG_DIR, './logs');
}

export const initLogger = (): [FoxLogger, Transform] => {
    const opts = parseLogOptions({file: false, console: 'debug'})
    const stream = new PassThrough({objectMode: true});
    const logger = buildLogger('debug', [
        buildDestinationStdout(opts.console),
        buildDestinationJsonPrettyStream(opts.console, {destination: stream, object: true, colorize: true})
    ]);
    return [logger, stream];
}

export const appLogger = async (config: FoxLogOptions = {}): Promise<[FoxLogger, PassThrough]> => {
    const stream = new PassThrough({objectMode: true});
    if(process.env.LOG_PATH === undefined && (config.file === undefined || config.file !== false) && (typeof config.file !== 'object' || config.file?.path === undefined)) {
        config.file = {
            level: config.file as LogLevel,
            path: 'logs/scrobble.log'
        }
    }
    const opts = parseLogOptions(config)
    const logger = await loggerAppRolling(config, {
        logBaseDir: typeof process.env.CONFIG_DIR === 'string' ? process.env.CONFIG_DIR : undefined,
        destinations: [
            buildDestinationJsonPrettyStream(opts.console, {destination: stream, object: true, colorize: true})
        ]
    });
    return [logger, stream];
}
export class MaybeLogger {
    logger?: FoxLogger

    constructor(logger?: FoxLogger, label?: string) {
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
