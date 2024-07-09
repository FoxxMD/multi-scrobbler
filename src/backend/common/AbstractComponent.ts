import { Logger } from "@foxxmd/logging";
import { hasNodeNetworkException } from "./errors/NodeErrors.js";
import { hasUpstreamError } from "./errors/UpstreamError.js";

export default abstract class AbstractComponent {
    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;
    authFailure?: boolean;

    buildOK?: boolean | null;
    connectionOK?: boolean | null;

    initializing: boolean = false;

    logger: Logger;

    initialize = async () => {
        this.logger.debug('Attempting to initialize...');
        try {
            this.initializing = true;
            await this.buildInitData();
            await this.checkConnection();
            await this.testAuth();
            this.logger.info('Fully Initialized!');
            try {
                await this.postInitialize();
            } catch (e) {
                this.logger.warn(new Error('Error occurred during post-initialization hook but was caught', {cause: e}));
            }
            return true;
        } catch(e) {
            this.logger.error(new Error('Initialization failed', {cause: e}));
            return false;
        } finally {
            this.initializing = false;
        }
    }

    public async buildInitData() {
        if(this.buildOK) {
            return;
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
            throw new Error('Building required data for initialization failed', {cause: e});
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


    public async checkConnection() {
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
            throw new Error('Communicating with upstream service failed', {cause: e});
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

    protected doAuthentication = async (): Promise<boolean> => this.authed

    // default init function, should be overridden if auth stage is required
    testAuth = async () => {
        if(!this.requiresAuth) {
            return;
        }

        try {
            this.authed = await this.doAuthentication();
            this.authFailure = !this.authed;
        } catch (e) {
            // only signal as auth failure if error was NOT either a node network error or a non-showstopping upstream error
            this.authFailure = !(hasNodeNetworkException(e) || hasUpstreamError(e, false));
            this.authed = false;
            this.logger.error(new Error(`Authentication test failed!${this.authFailure === false ? ' Due to a network issue. Will retry authentication on next heartbeat.' : ''}`, {cause: e}));
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
}
