import { isAbortError } from "abort-controller-x";
import { getErrorCause } from "../../core/ErrorUtils.js";

/**
 * Adapted from https://github.com/voxpelli/pony-cause/blob/main/lib/helpers.js to find cause by truthy function
 * */
export const findCauseByFunc = <T extends Error = Error>(err: any, func: (e: Error) => boolean): T | undefined => {
    if (!err || !func) return;
    if (!(err instanceof Error)) return;
    if (typeof func !== 'function') {
        return;
    }

    /**
     * Ensures we don't go circular
     */
    const seen = new Set<Error>();

    let currentErr: Error | undefined = err;

    while (currentErr && !seen.has(currentErr)) {
        seen.add(currentErr);

        if (func(currentErr)) {
            return currentErr as T;
        }

        currentErr = getErrorCause(currentErr) as unknown as T;
    }
};
export const findCauseByMessage = (err: any, msg: string) => {
    return findCauseByFunc(err, (e => e.message.toLocaleLowerCase().includes(msg.toLocaleLowerCase())));
}
/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
export const findCauseByReference = <T extends Error>(err: unknown, reference: new (...args: any[]) => T): T | undefined => {
    if (!err || !reference) return;
    if (!(err instanceof Error)) return;
    if (!(reference.prototype instanceof Error) &&
        // @ts-expect-error we are purposely checking if ref is generic error class
        reference !== Error) return;

    const seen = new Set();

    let currentErr = err;

    while (currentErr && !seen.has(currentErr)) {
        seen.add(currentErr);

        if (currentErr instanceof reference) {
            return currentErr;
        }

        currentErr = getErrorCause(currentErr) as unknown as T;
    }
};

export const isAbortReasonErrorLike = (signal: AbortSignal) => signal.aborted && signal.reason !== undefined && (isAbortError(signal.reason) || signal.reason instanceof Error);