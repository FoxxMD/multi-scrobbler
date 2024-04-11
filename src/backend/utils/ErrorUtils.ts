/**
 * Adapted from https://github.com/voxpelli/pony-cause/blob/main/lib/helpers.js to find cause by truthy function
 * */
export const findCauseByFunc = (err: any, func: (e: Error) => boolean) => {
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
            return currentErr;
        }

        currentErr = getErrorCause(currentErr);
    }
};
export const findCauseByMessage = (err: any, msg: string) => {
    return findCauseByFunc(err, (e => e.message.toLocaleLowerCase().includes(msg.toLocaleLowerCase())));
}
/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
export const getErrorCause = (err: Error | {
    cause?: unknown | (() => Error | {
        cause?: unknown | (() => Error | any);
    });
}): Error | undefined => {
    if (!err) return;

    const cause = err.cause;

    // VError / NError style causes
    if (typeof cause === 'function') {
        const causeResult = cause();

        return causeResult instanceof Error
            ? causeResult
            : undefined;
    } else {
        return cause instanceof Error
            ? cause
            : undefined;
    }
};
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

        currentErr = getErrorCause(currentErr);
    }
};
/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
const _messageWithCauses = (err: Error, seen = new Set<Error>()) => {
    if (!(err instanceof Error)) return '';

    const message = err.message;

    // Ensure we don't go circular or crazily deep
    if (seen.has(err)) {
        return message + ': ...';
    }

    const cause = getErrorCause(err);

    if (cause) {
        seen.add(err);

        return (message + ': ' +
            _messageWithCauses(cause, seen));
    } else {
        return message;
    }
};
/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
export const messageWithCauses = (err: Error) => _messageWithCauses(err);
