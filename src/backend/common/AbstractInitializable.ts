import type { Logger } from "@foxxmd/logging";
import {truncateStringToLength } from "../../core/StringUtils.ts";
import { hasNodeNetworkException } from "./errors/NodeErrors.ts";
import { hasUpstreamError } from "./errors/UpstreamError.ts";
import type {WebhookPayload} from "./infrastructure/config/health/webhooks.ts";
import { AuthCheckError, AuthError, BuildDataError, ConnectionCheckError, findAuthIssue, ParseCacheError, PostInitError, StageError, type AuthErrorMap } from "./errors/MSErrors.ts";
import { generateErrorTruthyTest, messageWithCausesTruncatedDefault, type TruthyErrorsOpts } from "../../core/ErrorUtils.ts";
import { spawn } from 'abort-controller-x';
import { COMPONENT_AUTH_TYPE, type ComponentAuthType } from "../../core/Atomic.ts";
export default abstract class AbstractInitializable {
    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authType: ComponentAuthType = COMPONENT_AUTH_TYPE.none;
    authed: boolean = false;
    authFailure?: boolean;

    private initController: AbortController | undefined;

    buildOK?: boolean | null;
    databaseOK?: boolean | null;
    connectionOK?: boolean | null;
    cacheOK?: boolean | null;
    errors?: Error[] = [];
    warnings?: Error[] = [];

    protected initializedOnce: boolean = false;
    initializing: boolean = false;

    config: Record<string, any>;

    logger: Logger;
    componentLogger?: Logger;

    protected constructor(config: Record<string, any>) {
        this.config = config;
    }

    public abstract notify(payload: WebhookPayload): Promise<void>;
    protected setStatus(status: string): void {
        return;
    }

    protected abstract getIdentifier(): string;

    initialize = async (options: {force?: boolean, notify?: boolean, notifyTitle?: string, internalOnly?: boolean} = {}) => {
        this.initializedOnce = true;
        if(this.initController !== undefined) {
            throw new Error(`Already trying to initialize, cannot attempt while an existing initialization attempt is running.`);
        }

        this.initController = new AbortController();
        return spawn(this.initController.signal, async (signal, {defer, fork}) => {
            this.setStatus('Initializing...');

            defer(async () => {
                this.initializing = false;
                this.initController = undefined;
            });

            const {force = false, notify = false, notifyTitle = 'Init Error', internalOnly = false} = options;

            this.logger.debug('Attempting to initialize...');
            try {
                this.initializing = true;
                if(this.componentLogger === undefined) {
                    await this.buildComponentLogger();
                }
                await this.buildDatabase(force);
                await this.buildInitData(force);
                await this.parseCache(force);
                try {
                    await this.postCache();
                } catch (e) {
                    if(e instanceof StageError) {
                        throw e;
                    } else {
                        throw new Error('Error occurred during post-cache hook', {cause: e});
                    }
                }
                if(internalOnly) {
                    return true;
                }
                await this.checkConnection(force);
                await this.testAuth(force);
                this.logger.info('Fully Initialized!');
                this.setStatus('Initialized!');
                try {
                    await this.postInitialize();
                } catch (e) {
                    throw new PostInitError('Error occurred during post-initialization hook', {cause: e});
                }
                this.errors = [];
                this.warnings = [];
                return true;
            } catch(e) {
                if(notify) {
                    await this.notify({identifier: this.getIdentifier(), title: notifyTitle, message: truncateStringToLength(500)(messageWithCausesTruncatedDefault(e)), priority: 'error'});
                }
                const initError = new Error('Initialization failed', {cause: e});
                this.errors = [initError];
                throw initError;
            } finally {
                this.initializing = false;
            }
        });
    }

    protected async buildComponentLogger() {
        await this.doBuildComponentLogger();
        return;
    }

    protected async doBuildComponentLogger() {
        return;
    }

    public async parseCache(force: boolean = false) {
        if(this.cacheOK) {
            if(!force) {
                return;
            }
            this.logger.verbose('Cache OK but step was forced');
        }
        try {
            const res = await this.doParseCache();
            if(res === undefined) {
                this.cacheOK = null;
                this.logger.trace('No cache to parse.');
                return;
            }
            if (res === true) {
                this.logger.verbose('Parsing caching succeeded');
            } else if (typeof res === 'string') {
                this.logger.verbose(`Parsing caching succeeded => ${res}`);
            }
            this.cacheOK = true;
        } catch (e) {
            this.cacheOK = false;
            throw new ParseCacheError('Parsing cache for initialization failed', {cause: e});
        }
    }

    /**
     * Build or parse any cache required for this Component
     *
     * * Return undefined if not possible or not required
     * * Return TRUE if build succeeded
     * * Return string if build succeeded and should log result
     * * Throw error on failure
     * */
    protected async doParseCache(): Promise<true | string | undefined> {
        return;
    }


    protected async postCache(): Promise<void> {
        return;
    }

    public async buildInitData(force: boolean = false) {
        if(this.buildOK) {
            if(!force) {
                return;
            }
            this.logger.verbose('Build OK but step was forced');
        }
        try {
            const res = await this.doBuildInitData();
            if(res === undefined) {
                this.buildOK = null;
                this.logger.trace('No required data to build.');
                return;
            }
            if (res === true) {
                this.logger.verbose('Building required data init succeeded');
            } else if (typeof res === 'string') {
                this.logger.verbose(`Building required data init succeeded => ${res}`);
            }
            this.buildOK = true;
        } catch (e) {
            this.buildOK = false;
            throw new BuildDataError('Building required data for initialization failed', {cause: e});
        }
    }

    /**
     * Build any data/config/objects required for this Source to communicate with upstream service
     *
     * * Return undefined if not possible or not required
     * * Return TRUE if build succeeded
     * * Return string if build succeeded and should log result
     * * Throw error on failure
     * */
    protected async doBuildInitData(): Promise<true | string | undefined> {
        return;
    }

    public async buildDatabase(force: boolean = false) {
        if(this.databaseOK) {
            if(!force) {
                return;
            }
            this.logger.verbose('Database OK but step was forced');
        }
        try {
            const res = await this.doBuildDatabase();
            if(res === undefined) {
                this.databaseOK = null;
                this.logger.trace('No required database steps.');
                return;
            }
            if (res === true) {
                this.logger.verbose('Required database init succeeded');
            } else if (typeof res === 'string') {
                this.logger.verbose(`Required database init succeeded => ${res}`);
            }
            this.databaseOK = true;
        } catch (e) {
            this.databaseOK = false;
            throw new BuildDataError('Required database init failed', {cause: e});
        }

        try {
            await this.postDatabase();
        } catch (e) {
            if(e instanceof StageError) {
                throw e;
            } else {
                throw new Error('Error occurred during post-database hook', {cause: e});
            }
        }
    }

    protected async postDatabase(): Promise<void> {
        return;
    }

    /**
     * Run/fetch/create any database data needed for this component to operate when ready
     *
     * * Return undefined if not possible or not required
     * * Return TRUE if database steps succeeded
     * * Return string if database steps succeeded and should log result
     * * Throw error on failure
     * */
    protected async doBuildDatabase(): Promise<true | string | undefined> {
        return;
    }

    public async checkConnection(force: boolean = false) {
        if(this.connectionOK) {
            if(!force) {
                return;
            }
            this.logger.debug('Connection OK but step was forced')
        }
        try {
            const res = await this.doCheckConnection();
            if (res === undefined) {
                this.logger.debug('Connection check was not required.');
                this.connectionOK = null;
                return;
            } else if (res === true) {
                this.logger.verbose('Connection check succeeded');
            } else {
                this.logger.verbose(`Connection check succeeded => ${res}`);
            }
            this.connectionOK = true;
        } catch (e) {
            this.connectionOK = false;
            throw new ConnectionCheckError('Communicating with upstream service failed', {cause: e});
        }
    }

    /**
     * Check Scrobbler upstream API/connection to ensure we can communicate
     *
     * * Return undefined if not possible or not required to check
     * * Return TRUE if communication succeeded
     * * Return string if communication succeeded and should log result
     * * Throw error if communication failed
     * */
    protected async doCheckConnection(): Promise<true | string | undefined> {
        return;
    }

    authGated = () => this.authType !== COMPONENT_AUTH_TYPE.none && !this.authed

    canTryAuth = () => this.isUsable() && this.authGated() && !this.hasUnrecoverableAuthFailure()

    findAuthIssue = <T extends keyof AuthErrorMap = 'auth'>(opts: Parameters<typeof findAuthIssue<T>>[1] = {}): AuthErrorMap[T] | undefined => {
        for(const err of this.errors) {
            const authError = findAuthIssue(err, opts);
            if(authError !== undefined) {
                return authError;
            }
        }
        return undefined;
    }

    hasAuthIssue = () => this.findAuthIssue() !== undefined;

    hasUnrecoverableAuthFailure = () => this.findAuthIssue({unrecoverable: true}) !== undefined;

    canAuthUnattended = () => !this.authGated() || this.authType === COMPONENT_AUTH_TYPE.unattended || (this.authType === COMPONENT_AUTH_TYPE.interactive && !this.hasUnrecoverableAuthFailure()) ;

    protected doAuthentication = async (): Promise<boolean> => this.authed

    // default init function, should be overridden if auth stage is required
    testAuth = async (force: boolean = false) => {
        if(this.authType === COMPONENT_AUTH_TYPE.none) {
            return;
        }
        if(this.authed) {
            if(!force) {
                return;
            }
            this.logger.debug('Auth OK but step was forced');
        }

        // only throw *before* testing if we have previously tested and the error was unrecoverable
        // there is no reason to constantly retry auth when we already know it won't succeed
        //
        // test retries should be forced by api calls and auth callback flows *after* we have made changes to component credentials
        const unrecoverableAuth = this.findAuthIssue({unrecoverable: true});
        if(unrecoverableAuth !== undefined) {
            let unrecoverable: boolean | undefined,
            cause: Error;
            if(!force) {
                if(unrecoverableAuth instanceof AuthCheckError) {
                    // we threw a fallback AuthCheckError
                    unrecoverable = true;
                    cause = unrecoverableAuth.cause as Error;
                } else {
                    cause = unrecoverableAuth;
                }
                if(this.authType === COMPONENT_AUTH_TYPE.interactive) {
                    throw new AuthCheckError('Authentication failure: Will not retry auth because user interaction is required for authentication', {cause, unrecoverable});
                }
                throw new AuthCheckError('Authentication failure: Will not retry auth because authentication previously failed and must be reauthenticated', {cause, unrecoverable});
            }
            this.logger.debug('Auth previously failed for non upstream/network reasons but retry is being forced');
        }

        try {
            await this.doAuthentication();
            this.authed = true;
        } catch (e) {
            let unrecoverableMsg: boolean,
            unrecoverable: boolean | undefined;
            if(e instanceof AuthError) {
                unrecoverableMsg = e.unrecoverable;
            } else {
                // if component auth test didn't throw AuthError (it should have!)
                // then fallback teo determining by these conditions
                unrecoverable = !(hasNodeNetworkException(e) || hasUpstreamError(e, false));
                unrecoverableMsg = unrecoverable;
            }
            this.authed = false;
            throw new AuthCheckError(`Authentication test failed!${unrecoverableMsg === false ? ' Due to a network issue. Will retry authentication on next heartbeat.' : ''}`, {cause: e, unrecoverable});
        }
    }

    public isReady() {
        return (this.buildOK === null || this.buildOK === true) &&
            (this.databaseOK === null || this.databaseOK === true) &&
            (this.connectionOK === null || this.connectionOK === true)
            && !this.authGated();
    }

    public isUsable() {
        return (this.buildOK === null || this.buildOK === true) &&
            (this.databaseOK === null || this.databaseOK === true) &&
            (this.connectionOK === null || this.connectionOK === true);
    }

    /**
     * Override to perform some action after successfully initializing
     *
     * Results will be try-catched and swallowed/logged if an error is thrown. This will not affect initialized state.
     * */
    protected async postInitialize(): Promise<void> {
        return;
    }

    public additionalApiData(): Record<string, any> {
        return {};
    }

    public clearErrors(opts?: TruthyErrorsOpts) {
        if (!opts) { this.errors = []; return; }
        
        const test = generateErrorTruthyTest(opts);
        this.errors = this.errors.filter(x => !test(x));
    }

    public replaceErrors(e: Error, opts?: TruthyErrorsOpts) {
        if(opts !== undefined) {
            this.clearErrors(opts);
        } else {
            this.clearErrors({instance: e});
        }
        this.errors.push(e);
    }
}
