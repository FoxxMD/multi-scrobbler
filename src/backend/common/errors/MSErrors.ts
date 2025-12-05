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

export class SimpleError extends Error implements HasSimpleError {
    simple: boolean;

    public constructor(msg: string, options?: ErrorOptions & { simple?: boolean }) {
        super(msg, options);
        const {
            simple = true
        } = options || {};
        this.simple = simple;
    }
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