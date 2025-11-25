import { childLogger, Logger } from "@foxxmd/logging";
import { Simulate } from "react-dom/test-utils";
import {truncateStringToLength } from "../../core/StringUtils.js";
import { hasNodeNetworkException } from "./errors/NodeErrors.js";
import { hasUpstreamError } from "./errors/UpstreamError.js";
import play = Simulate.play;
import { WebhookPayload } from "./infrastructure/config/health/webhooks.js";
import { AuthCheckError, BuildDataError, ConnectionCheckError, ParseCacheError, PostInitError, StageError, TransformRulesError } from "./errors/MSErrors.js";
import { messageWithCauses, messageWithCausesTruncatedDefault } from "../utils/ErrorUtils.js";

export default abstract class AbstractInitializable {
    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;
    authFailure?: boolean;

    buildOK?: boolean | null;
    connectionOK?: boolean | null;
    cacheOK?: boolean | null;

    initializing: boolean = false;

    config: Record<string, any>;

    logger: Logger;
    componentLogger?: Logger;

    protected constructor(config: Record<string, any>) {
        this.config = config;
    }

    public abstract notify(payload: WebhookPayload): Promise<void>;

    protected abstract getIdentifier(): string;

    initialize = async (options: {force?: boolean, notify?: boolean, notifyTitle?: string} = {}) => {

        const {force = false, notify = false, notifyTitle = 'Init Error'} = options;

        this.logger.debug('Attempting to initialize...');
        try {
            this.initializing = true;
            if(this.componentLogger === undefined) {
                await this.buildComponentLogger();
            }
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
            await this.checkConnection(force);
            await this.testAuth(force);
            this.logger.info('Fully Initialized!');
            try {
                await this.postInitialize();
            } catch (e) {
                throw new PostInitError('Error occurred during post-initialization hook', {cause: e});
            }
            return true;
        } catch(e) {
            if(notify) {
                await this.notify({title: `${this.getIdentifier()} - ${notifyTitle}`, message: truncateStringToLength(500)(messageWithCausesTruncatedDefault(e)), priority: 'error'});
            }
            throw new Error('Initialization failed', {cause: e});
        } finally {
            this.initializing = false;
        }
    }

    protected async buildComponentLogger() {
        await this.doBuildComponentLogger();
        return;
    }

    protected async doBuildComponentLogger() {
        return;
    }

    tryInitialize = async (options: {force?: boolean, notify?: boolean, notifyTitle?: string} = {}) => {
        if(this.initializing) {
            throw new Error(`Already trying to initialize, cannot attempt while an existing initialization attempt is running.`)
        }
        try {
            return await this.initialize(options);
        } catch (e) {
            throw e;
        }
    }

    public async parseCache(force: boolean = false) {
        if(this.cacheOK) {
            if(!force) {
                return;
            }
            this.logger.debug('Cache OK but step was forced');
        }
        try {
            const res = await this.doParseCache();
            if(res === undefined) {
                this.cacheOK = null;
                this.logger.debug('No cache to parse.');
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
            this.logger.debug('Build OK but step was forced');
        }
        try {
            const res = await this.doBuildInitData();
            if(res === undefined) {
                this.buildOK = null;
                this.logger.debug('No required data to build.');
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

    authGated = () => this.requiresAuth && !this.authed

    canTryAuth = () => this.isUsable() && this.authGated() && this.authFailure !== true

    canAuthUnattended = () => !this.authGated || !this.requiresAuthInteraction || (this.requiresAuthInteraction && !this.authFailure);

    protected doAuthentication = async (): Promise<boolean> => this.authed

    // default init function, should be overridden if auth stage is required
    testAuth = async (force: boolean = false) => {
        if(!this.requiresAuth) {
            return;
        }
        if(this.authed) {
            if(!force) {
                return;
            }
            this.logger.debug('Auth OK but step was forced');
        }

        if(this.authFailure) {
            if(!force) {
                if(this.requiresAuthInteraction) {
                    throw new AuthCheckError('Authentication failure: Will not retry auth because user interaction is required for authentication');
                }
                throw new AuthCheckError('Authentication failure: Will not retry auth because authentication previously failed and must be reauthenticated');
            }
            this.logger.debug('Auth previously failed for non upstream/network reasons but retry is being forced');
        }

        try {
            this.authed = await this.doAuthentication();
            this.authFailure = !this.authed;
        } catch (e) {
            // only signal as auth failure if error was NOT either a node network error or a non-showstopping upstream error
            this.authFailure = !(hasNodeNetworkException(e) || hasUpstreamError(e, false));
            this.authed = false;
            throw new AuthCheckError(`Authentication test failed!${this.authFailure === false ? ' Due to a network issue. Will retry authentication on next heartbeat.' : ''}`, {cause: e});
        }
    }

    public isReady() {
        return (this.buildOK === null || this.buildOK === true) &&
            (this.connectionOK === null || this.connectionOK === true)
            && !this.authGated();
    }

    public isUsable() {
        return (this.buildOK === null || this.buildOK === true) &&
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
}
