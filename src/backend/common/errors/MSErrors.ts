import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import mergeErrorCause from 'merge-error-cause';
import { findCauseByFunc, findCauseByReference } from "../../utils/ErrorUtils.js";

export abstract class NamedError extends Error {
    public abstract name: string;
}

export abstract class StageError extends NamedError {}

export class BuildDataError extends StageError {
    name = 'Init Build Data';
}

export class ParseCacheError extends StageError {
    name = 'Init Parse Cache';
}

export class TransformRulesError extends StageError {
    name = 'Transform Rules';
}

export class ConnectionCheckError extends StageError {
    name = 'Connection Check';
}

export class AuthCheckError extends StageError {
    name = 'Authentication Check';
}

export class PostInitError extends StageError {
    name = 'Post Initialization';
}

const STACK_AT_REGEX = new RegExp(/[\n\r]\s*at/);

export class SimpleError extends Error implements HasSimpleError {
    simple: boolean;
    name = 'Error';

    public constructor(msg: string, options?: ErrorOptions & { simple?: boolean, shortStack?: boolean }) {
        super(msg, options);
        const {
            simple = true,
            shortStack = false
        } = options || {};
        this.simple = simple;
        if(shortStack) {
            const atIndex = parseRegexSingle(STACK_AT_REGEX,this.stack);
            if(atIndex !== undefined) {
                const firstn = this.stack.indexOf('\n', atIndex.index + atIndex.match.length);
                if(firstn !== -1) {
                    this.stack = this.stack.slice(0, firstn);
                }
            }
        }
    }
}

export class StageTransformError extends NamedError {
    name = 'Stage Transform';
    stageName: string;
    constructor(name: string, message: string, options?: ErrorOptions) {
        super(message, options);
        this.stageName = name;
    }
}

export class SkipTransformStageError extends SimpleError {
    name = 'Skip Transform Stage';
}

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
        return mergeErrorCause(err);
    }
    return err;
}