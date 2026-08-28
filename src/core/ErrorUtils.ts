import type { MarkOptional } from "ts-essentials";
import { truncateStringToLength } from "./StringUtils.ts";
import { type ErrorLike, isErrorLike } from 'serialize-error';

export type ErrorIsh = Error | MarkOptional<ErrorLike, 'stack'>;

export const isErrorIsh = (val: unknown): val is ErrorIsh => {
    if(val === undefined || val === null || typeof val !== 'object') {
        return false;
    }
    if(!('message' in val)) {
        return false;
    }
    if('cause' in val) {
        if(!isErrorIsh(val.cause)) {
            return false;
        }
    }
    return true;
}

/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
export const _messageWithCauses = (err: ErrorIsh, seen = new Set<ErrorIsh>(), msgTransform: MessageTransformer = MessageTransformerDefault, joiner: string = ' => '): string => {
    if (!(err instanceof Error) && !isErrorLike(err)) return '';

    const message = err.message;

    // Ensure we don't go circular or crazily deep
    if (seen.has(err)) {
        return msgTransform(message) + `${joiner}...`;
    }

    const cause = getErrorCause(err);

    if (cause) {
        seen.add(err);

        return (msgTransform(message) + joiner +
            _messageWithCauses(cause, seen, msgTransform, joiner));
    } else {
        return msgTransform(message);
    }
};/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
export const messageWithCauses = (err: ErrorIsh, msgTransformer?: MessageTransformer, joiner?: string) => _messageWithCauses(err, new Set<ErrorIsh>(), msgTransformer, joiner);
export const messageWithCausesTruncated = (length: number) => {
    const t = truncateStringToLength(length);
    return (err: ErrorIsh) => messageWithCauses(err, t);
};
export type MessageTransformer = (val: string) => string;
export const MessageTransformerDefault = (val: string) => val;
export const messageWithCausesTruncatedDefault = messageWithCausesTruncated(100);
/**
 * Adapted from https://github.com/voxpelli/pony-cause
 * */
export const getErrorCause = (err: Error |
    ErrorLike | {
    cause?: unknown | (() => ErrorIsh | {
        cause?: unknown | (() => ErrorIsh | any);
    });
}): ErrorIsh | undefined => {
    if (!err) return;

    const cause = err.cause;

    // VError / NError style causes
    if (typeof cause === 'function') {
        const causeResult = cause();

        return isErrorLike(causeResult)
            ? causeResult
            : undefined;
    } else {
        return isErrorLike(cause)
            ? cause
            : undefined;
    }
};

/** A generic shape for a function (Class) that has a constructor.
 * Can be used to determine if the passed function is a (non-instanced) Class */
type ClassCtor = abstract new (...args: any[]) => unknown;

export type TruthyErrorsOpts =
    | { type: ClassCtor }
    | { instance: object }
    | { predicate: (e: Error) => boolean };

/**
 * Generate a function that detects if a given Error...
 * 
 * * passes a truthy function test (predicate)
 * * is an instance of a Class (type)
 * * is an instance of the Class of a passed instance (instance)
 * 
 * EX, same order as above
 * 
 * generateErrorTruthyTest({ predicate: (e) => e.message === 'x' })
 * generateErrorTruthyTest({ type: MyError) })
 * generateErrorTruthyTest({ instance: new MyError('oops') })
 * 
 * @returns 
 */
export const generateErrorTruthyTest = (opts: TruthyErrorsOpts) => {

    if ('predicate' in opts) {
        return (e: Error) => opts.predicate(e);
    }

    const ctor = 'type' in opts
        ? opts.type
        : opts.instance.constructor as ClassCtor;

    return (e: Error) => e instanceof ctor;
}