import { childLogger, Logger, loggerAppRolling, LogOptions, parseLogOptions, } from '@foxxmd/logging';
import { buildDestinationJsonPrettyStream, buildDestinationStdout, buildLogger } from "@foxxmd/logging/factory";
import { PassThrough, Transform } from "node:stream";
import path from "path";
import process from "process";
import { projectDir } from "./index.js";

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
    const opts = parseLogOptions(config)
    const logger = await loggerAppRolling(config, {
        logBaseDir: typeof process.env.CONFIG_DIR === 'string' ? process.env.CONFIG_DIR : undefined,
        logDefaultPath: './logs/scrobble.log',
        destinations: [
            buildDestinationJsonPrettyStream(opts.console, {destination: stream, object: true, colorize: true})
        ]
    });
    return [logger, stream];
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
