import { type FileLogOptions, type Logger, loggerAppRolling, type LogLevel, type LogLevelStreamEntry, type LogOptions, parseLogOptions } from '@foxxmd/logging';
import { buildDestinationJsonPrettyStream, buildDestinationRollingFile, buildDestinationStdout, buildLogger } from "@foxxmd/logging/factory";
import type { Transform } from "node:stream";
import { PassThrough } from "node:stream";
import path from "path";
import process from "process";
import { getDataDir } from "./index.ts";
import { isDebugMode } from '../utils.ts';

const logPath = path.resolve(getDataDir(), `./logs`);

export const initLogger = (): [Logger, Transform] => {
    const opts = parseLogOptions({file: false, console: 'trace'})
    const stream = new PassThrough({objectMode: true});
    const logger = buildLogger('trace', [
        buildDestinationStdout(opts.console),
        buildDestinationJsonPrettyStream(opts.console, {destination: stream, object: true, colorize: true})
    ]);
    return [logger, stream];
}

export const appLogger = async (config: LogOptions = {}): Promise<[Logger, PassThrough]> => {
    const stream = new PassThrough({objectMode: true});
    const { file } = config;
    const opts = parseLogOptions(isDebugMode() ? {...config, file: typeof file === 'object' ? {...file, level: 'trace'} : 'trace', console: 'trace', level: 'trace'} : config);
    const logger = await loggerAppRolling(opts, {
        logBaseDir: logPath,
        logDefaultPath: './scrobble.log',
        destinations: [
            buildDestinationJsonPrettyStream('trace', {destination: stream, object: true, colorize: true})
        ]
    });
    return [logger, stream];
}

export const componentFileLogger = async (type: string, name: string, fileConfig: true | LogLevel | FileLogOptions, config: LogOptions = {}): Promise<Logger> => {
    const opts = parseLogOptions(config, {
        logBaseDir: logPath,
        logDefaultPath: './scrobble.log'
    });

    const base = path.dirname(typeof opts.file.path === 'function' ? opts.file.path() : opts.file.path);
    const componentLogPath = path.join(base, `${type}-${name}.log`);

    const componentConfig: LogOptions = {
        level: opts.level ?? 'trace'
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

        return buildLogger('trace' as LogLevel, streams);
    } else {
        throw new Error('File must be set');
    }
}


