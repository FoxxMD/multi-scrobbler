export abstract class NamedError extends Error {
    public abstract name: string;
}

export abstract class StageError extends NamedError {}

export class BuildDataError extends StageError {
    name = 'Init Build Data';
}

export class TransformRulesError extends StageError {
    name = 'Transform Rules';
}

export class ConnectionCheckError extends StageError {
    name = 'Conenction Check';
}

export class AuthCheckError extends StageError {
    name = 'Authentication Check';
}

export class PostInitError extends StageError {
    name = 'Post Initialization';
}