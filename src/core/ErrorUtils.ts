import { type MarkOptional } from "ts-essentials";
import { truncateStringToLength } from "./StringUtils.js";
import { ErrorLike, isErrorLike } from 'serialize-error';

export type ErrorIsh = Error | MarkOptional<ErrorLike, 'stack'>;

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

