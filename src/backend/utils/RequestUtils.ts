import { Files, File } from "formidable";
import VolatileFile from "formidable/VolatileFile.js";
import { KNOWN_MEDIA_PROVIDER_URLS } from "../../core/Atomic.js";
import { RequestRetryOptions } from "../common/infrastructure/config/common.js";
import { Logger } from "@foxxmd/logging";
import request, { Request, Response } from 'superagent';
import pRetry, { RetryContext, Options } from 'p-retry';
import { DEFAULT_RETRY_MULTIPLIER } from "../common/infrastructure/Atomic.js";
import { SimpleError } from "../common/errors/MSErrors.js";
import { loggerNoop } from "../common/logging.js";
import { findCauseByFunc } from "./ErrorUtils.js";
import { isSuperAgentResponseError } from "../common/errors/ErrorUtils.js";
import { isNodeNetworkException, NodeNetworkException } from "../common/errors/NodeErrors.js";
import { formatNumber } from '../../core/DataUtils.js';
import { UpstreamError } from "../common/errors/UpstreamError.js";

// typings from Formidable are all nuts.
// VolatileFile is missing buffer and also does not extend File even though it should

export const getValidMultipartJsonFile = (files: Files | File): [VolatileFile, string[]?] => {

    const logs: string[] = [];

    try {

        if (isVolatileFile(files)) {
            if ('mimetype' in files && files.mimetype !== undefined) {
                if (files.mimetype.includes('json')) {
                    logs.push(`Found ${getFileIdentifier(files)} with mimetype '${files.mimetype}'`)
                    return [files as unknown as VolatileFile, logs];
                } else {
                    logs.push(`${getFileIdentifier(files)} mimetype '${files.mimetype}' does not include 'json'`);
                }
            } else {
                logs.push(`${getFileIdentifier(files)} had no mimetype`)
            }
        } else {
            for (const [partName, namedFile] of Object.entries(files)) {
                if (Array.isArray(namedFile)) {
                    for (const [index, file] of Object.entries(namedFile)) {
                        if ('mimetype' in file && file.mimetype !== undefined) {
                            if (file.mimetype.includes('json')) {
                                logs.push(`Found ${partName}.${index}.${getFileIdentifier(file)} with mimetype '${file.mimetype}'`)
                                return [file as unknown as VolatileFile, logs];
                            } else {
                                logs.push(`${partName}.${index}.${getFileIdentifier(file)} mimetype '${file.mimetype}' does not include 'json'`);
                            }
                        } else {
                            logs.push(`${partName}.${index}.${getFileIdentifier(file)} had no mimetype`)
                        }
                    }
                } else {
                    // this shouldn't happen but it was happening so...
                    const singleFile = namedFile as File;
                    if (typeof singleFile === 'object' && 'mimetype' in singleFile && singleFile.mimetype !== undefined) {
                        if (singleFile.mimetype.includes('json')) {
                            logs.push(`Found ${partName}.${getFileIdentifier(singleFile)} with mimetype '${singleFile.mimetype}'`);
                            return [namedFile as unknown as VolatileFile, logs];
                        } else {
                            logs.push(`${partName}.${getFileIdentifier(singleFile)} mimetype '${singleFile.mimetype}' does not include 'json'`);
                        }
                    } else {
                        logs.push(`${partName}.${getFileIdentifier(singleFile)} had no mimetype`)
                    }
                }
            }
        }
    } catch (e) {
        throw new Error('Unexpected error occurred while trying to find valid json file in formdata', {cause: e});
    }

    return [undefined, logs];
}

const isVolatileFile = (val: unknown): val is File => {
    return typeof val === 'object'
        && val !== null
        && 'size' in val
        && 'filepath' in val;
}

export const getFileIdentifier = (f: File): string => {
    return f.originalFilename === null ? f.newFilename : f.originalFilename;
}

export const urlContainsDomains = (url: string | URL, domains: string[]): boolean => {
    const u = typeof url === 'string' ? url : url.hostname;
    return domains.some(x => u.includes(x));
}

export const urlContainsKnownMediaDomain = (url: string | URL): boolean => {
    return urlContainsDomains(url, KNOWN_MEDIA_PROVIDER_URLS);
}

export interface TryApiCallOptions extends RequestRetryOptions {
    logger?: Logger
    logFailure?: boolean | ShouldLogFailure
    noRetryStatus?: number[]
    shouldRetry?: ShouldRetryMaybe
}

export const NO_RETRY_HTTP_STATUS = [400,403,401];

export type ShouldLogFailure = (context: RetryContext) => boolean;
export type ShouldRetryMaybe = (context: RetryContext) => boolean | undefined;

export const tryApiCall = async <T = Response>(reqFunc: () => T, opts: TryApiCallOptions = {}): Promise<T> => {
    const {
        maxRequestRetries: retries = 2,
        retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
        logFailure = true,
        logger = loggerNoop,
        noRetryStatus = NO_RETRY_HTTP_STATUS,
        shouldRetry
    } = opts;

    const retryOpts: Options = {
        retries: retries,
        factor: retryMultiplier,
        minTimeout: 1000,
        maxRetryTime: 30000,
    }

    const getDelay = curriedDelay(retryOpts);

    try {
        return await pRetry(() => reqFunc(), {
            ...retryOpts,
            shouldRetry(context) {
                let willRetry: boolean;
                if (shouldRetry !== undefined) {
                    try {
                        const res = shouldRetry(context);
                        if (typeof res === 'boolean') {
                            willRetry = res;
                        }
                    } catch (e) {
                        logger.warn(new SimpleError('Failed to evaluate shouldRetry function. Falling back to default retry logic.', { cause: e }));
                    }
                }
                if(willRetry === undefined) {
                    const cause = findCauseByFunc<request.ResponseError | NodeNetworkException>(context.error, (e) => isSuperAgentResponseError(e) || isNodeNetworkException(e));
                    if (cause === undefined) {
                        willRetry = false;
                    } else if (isNodeNetworkException(cause)) {
                        willRetry = true;
                    } else if (noRetryStatus.includes(cause.status)) {
                        willRetry = false;
                    } else {
                        willRetry = true;
                    }
                }

                if(willRetry) {
                    let shouldLog: boolean = false;
                    if (logFailure === true) {
                        shouldLog = true;
                    }
                    else if (typeof logFailure === 'function') {
                        try {
                            shouldLog = logFailure(context);
                        } catch (e) {
                            logger.warn(new SimpleError('Failed to evaluate logFailure function (lol). Falling back to logging original error for context.', { cause: e }));
                            shouldLog = true;
                        }
                    }
                    if (shouldLog) {
                        logger.warn(new SimpleError(`Request attempt ${context.attemptNumber} failed. ${context.retriesLeft} retries left. Waiting ${getDelay(context.retriesConsumed + 1)}s before next try.`, { cause: context.error, shortStack: true }));
                    }
                }

                return willRetry;
            }
        })
    } catch (e) {
        throw e;
    }
}

const calculateDelay = (retriesConsumed: number, options: Options = {}) => {
	const attempt = Math.max(1, retriesConsumed + 1);
	const random = (options.randomize ?? false) ? (Math.random() + 1) : 1;

	let timeout = Math.round(random * (options.minTimeout ?? 1000) * ((options.factor ?? 2) ** (attempt - 1)));
	timeout = Math.min(timeout, options.maxTimeout ?? Number.POSITIVE_INFINITY);

	return timeout;
}

const curriedDelay = (options: Options = {}) => {
    return (retriesConsumed: number) => formatNumber(calculateDelay(retriesConsumed, options) / 1000);
}

export const noRetryOnUpstreamError = (context: RetryContext): boolean | undefined => {
    if(context.error instanceof UpstreamError && context.error.showStopper === true) {
        return true;
    }
    return undefined;
}