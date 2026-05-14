import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import mergeErrorCause from 'merge-error-cause';
import { findCauseByFunc, isAbortReasonErrorLike } from "../../utils/ErrorUtils.js";
import { UpstreamError, UpstreamErrorOptions } from "./UpstreamError.js";
import { isAbortError } from "abort-controller-x";
import {addKnownErrorConstructor} from 'serialize-error';

export abstract class NamedError extends Error {
    public abstract name: string;
}

export abstract class StageError extends NamedError {}

export class BuildDataError extends StageError {
    name = 'Init Build Data';
}
addKnownErrorConstructor(BuildDataError);

export class ParseCacheError extends StageError {
    name = 'Init Parse Cache';
}
addKnownErrorConstructor(ParseCacheError);

export class TransformRulesError extends StageError {
    name = 'Transform Rules';
}
addKnownErrorConstructor(TransformRulesError);
export class ConnectionCheckError extends StageError {
    name = 'Connection Check';
}
addKnownErrorConstructor(ConnectionCheckError);

export class AuthCheckError extends StageError {
    name = 'Authentication Check';
}
addKnownErrorConstructor(AuthCheckError);

export class PostInitError extends StageError {
    name = 'Post Initialization';
}
addKnownErrorConstructor(PostInitError);

const STACK_AT_REGEX = new RegExp(/[\n\r]\s*at/);

export class SimpleError extends Error implements HasSimpleError {
    simple: boolean;
    name = 'SimpleError';

    stackShortened: boolean = false;

    shortenStack() {
        if(this.stack !== undefined) {
            const atIndex = parseRegexSingle(STACK_AT_REGEX, this.stack);
            if(atIndex !== undefined) {
                const firstn = this.stack.indexOf('\n', atIndex.index + atIndex.match.length);
                if(firstn !== -1) {
                    this.stack = this.stack.slice(0, firstn);
                    this.stackShortened = true;
                }
            }
        }
    }

    public constructor(msg: string, options?: ErrorOptions & { simple?: boolean, shortStack?: boolean }) {
        super(msg, options);
        const {
            simple = true,
            shortStack = false
        } = options || {};
        this.simple = simple;
        Error.captureStackTrace(this, this.constructor);
        if(shortStack) {
            this.shortenStack();
        }
    }
}
addKnownErrorConstructor(SimpleError, () => new SimpleError(''))

export class StageTransformError extends NamedError {
    name = 'Stage Transform';
    stageName: string;
    constructor(name: string, message: string, options?: ErrorOptions) {
        super(message, options);
        this.stageName = name;
    }
}
addKnownErrorConstructor(StageTransformError, () => new StageTransformError('',''))

export class SkipTransformStageError extends SimpleError {
    name = 'Skip Transform Stage';
}
addKnownErrorConstructor(SkipTransformStageError, () => new SkipTransformStageError(''))

export class StagePrerequisiteError extends SimpleError {
    name = 'Stage Prerequisite';
}
addKnownErrorConstructor(StagePrerequisiteError, () => new StagePrerequisiteError(''))

export interface HasSimpleError extends Error {
    simple: boolean
}

export const isSimpleError = (e: unknown): e is HasSimpleError => {
    if(!(e instanceof Error)) {
        return false;
    }
    return 'simple' in e;
}

export const mergeSimpleError = (err: Error): Error => {
    const anySimple = findCauseByFunc<SimpleError>(err, (e) => isSimpleError(e));
    if(anySimple && anySimple.simple) {
        // mergeErrorCause mutates the argument
        // and we want to be able to do more cause/error parsing after merging for logging
        // so give it a copy instead of the original
        return mergeErrorCause(structuredClone(err));
    }
    return err;
}

export class ScrobbleSubmitError<T extends (object | string) = object> extends UpstreamError {
    name = 'Scrobble Submit Error';
    payload?: T;
    constructor(message: string, options?: UpstreamErrorOptions & {payload?: T}) {
        super(message, options);
        this.payload = options?.payload;
    }
}
addKnownErrorConstructor(ScrobbleSubmitError, () => new ScrobbleSubmitError(''))

export class AbortedError extends SimpleError {
    override name = 'Aborted Operation';
}
addKnownErrorConstructor(AbortedError, () => new AbortedError(''));

export const generateLoggableAbortReason = (msg: string, signal: AbortSignal): AbortedError => {
    const reason = signal.reason;
    let err: AbortedError;
    if(isAbortReasonErrorLike(signal)) {
        err = new AbortedError(msg, {cause: reason});
    } else {
        err = new AbortedError(`${msg} => ${reason ?? 'No Reason Given'}`, {simple: true, shortStack: true});
    }
    Error.captureStackTrace(err, generateLoggableAbortReason);
    return err;
}

export class InvalidRegexError extends SimpleError {
    override name = 'Invalid Regex Error';
    constructor(regex: RegExp | RegExp[], val?: string, url?: string, message?: string) {
        const msgParts = [
            message ?? 'Regex(es) did not match the value given.',
        ];
        let regArr = Array.isArray(regex) ? regex : [regex];
        for(const r of regArr) {
            msgParts.push(`Regex: ${r}`)
        }
        if (val !== undefined) {
            msgParts.push(`Value: ${val}`);
        }
        if (url !== undefined) {
            msgParts.push(`Sample regex: ${url}`);
        }
        super(msgParts.join('\r\n'));
    }
}
addKnownErrorConstructor(InvalidRegexError, () => new InvalidRegexError(new RegExp(/1/)));
