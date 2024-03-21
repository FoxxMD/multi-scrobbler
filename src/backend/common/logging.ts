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

// docker stdout only colorizes if run with `-it` flag or `tty: true` in docker-compose
// but most common outputs and web log viewers (portainer, dozzle) support colors and using those flags/options is not common for most users
// so
// set COLORED_CONSOLE=true in Dockerfile to coerce colorizing output when running in our docker container.
// and using this instead of FORCE_COLOR (used by colorette) so that we only affect console output instead of all streams
const coloredEnv = process.env.COLORED_CONSOLE;
const coloredConsole = (coloredEnv === undefined || coloredEnv === '') ? undefined : parseBool(process.env.COLORED_CONSOLE);
const prettyDefaults: PrettyOptionsExtra = {};
// colorette only does autodetection if `colorize` prop is not present *at all*, rather than just being undefined
// so need to use default object and only add if we detect there is a non-empty value
if(coloredConsole !== undefined) {
    prettyDefaults.colorize = coloredConsole;
}

export const initLogger = (): [FoxLogger, Transform] => {
    const opts = parseLogOptions({file: false, console: 'debug'})
    const stream = new PassThrough({objectMode: true});
    const logger = buildLogger('debug', [
        buildDestinationStdout(opts.console, prettyDefaults),
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
        ],
        pretty: prettyDefaults
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
