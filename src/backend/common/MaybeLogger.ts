import { Logger } from "@foxxmd/logging";


export class MaybeLogger {
    logger?: Logger;

    constructor(logger?: Logger, label?: string) {
        if (logger !== undefined && label !== undefined) {
            this.logger = logger;//this.logger = childLogger(logger, label);
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

    public trace(first: any, ...rest: any) {
        if (this.logger) {
            this.logger.trace(first, ...rest);
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
const noopLog = (_: any, ...rest: any) => undefined;

export const loggerNoop: Logger = {
    trace: noopLog,
    debug: noopLog,
    log: noopLog,
    info: noopLog,
    verbose: noopLog,
    warn: noopLog,
    error: noopLog,
    fatal: noopLog,
    silent: noopLog,
    level: 'silent',
    child: (_: any, ...rest: any) => loggerNoop as Logger
} as unknown as Logger;


