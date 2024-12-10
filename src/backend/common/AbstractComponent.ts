import { childLogger, Logger } from "@foxxmd/logging";
import {
    cacheFunctions,
} from "@foxxmd/regex-buddy-core";
import deepEqual from 'fast-deep-equal';
import { Simulate } from "react-dom/test-utils";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, truncateStringToLength } from "../../core/StringUtils.js";

import {
    configPartsToStrongParts, countRegexes,
    transformPlayUsingParts
} from "../utils/PlayTransformUtils.js";
import { hasNodeNetworkException } from "./errors/NodeErrors.js";
import { hasUpstreamError } from "./errors/UpstreamError.js";
import {
    ConditionalSearchAndReplaceRegExp,
    PlayTransformParts, PlayTransformPartsArray,
    PlayTransformRules,
    TRANSFORM_HOOK,
    TransformHook
} from "./infrastructure/Atomic.js";
import { CommonClientConfig } from "./infrastructure/config/client/index.js";
import { CommonSourceConfig } from "./infrastructure/config/source/index.js";
import play = Simulate.play;
import { WebhookPayload } from "./infrastructure/config/health/webhooks.js";
import { AuthCheckError, BuildDataError, ConnectionCheckError, PostInitError, TransformRulesError } from "./errors/MSErrors.js";
import { messageWithCauses } from "../utils/ErrorUtils.js";

export default abstract class AbstractComponent {
    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;
    authFailure?: boolean;

    buildOK?: boolean | null;
    connectionOK?: boolean | null;

    initializing: boolean = false;

    config: CommonClientConfig | CommonSourceConfig;

    transformRules!: PlayTransformRules;
    regexCache!: ReturnType<typeof cacheFunctions>;

    logger: Logger;
    componentLogger?: Logger;

    protected constructor(config: CommonClientConfig | CommonSourceConfig) {
        this.config = config;
    }

    protected abstract notify(payload: WebhookPayload): Promise<void>;

    protected abstract getIdentifier(): string;

    // TODO refactor throw error
    initialize = async (options: {force?: boolean, notify?: boolean} = {}) => {

        const {force = false, notify = false} = options;

        this.logger.debug('Attempting to initialize...');
        try {
            this.initializing = true;
            if(this.componentLogger === undefined) {
                await this.buildComponentLogger();
            }
            await this.buildInitData(force);
            this.buildTransformRules();
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
            this.logger.error(new Error('Initialization failed', {cause: e}));
            if(notify) {
                await this.notify({title: `${this.getIdentifier()} - Init Error`, message: truncateStringToLength(150)(messageWithCauses(e)), priority: 'error'});
            }
            return false;
        } finally {
            this.initializing = false;
        }
    }

    private async buildComponentLogger() {
        await this.doBuildComponentLogger();
        return;
    }

    protected async doBuildComponentLogger() {
        return;
    }

    tryInitialize = async (options: {force?: boolean, notify?: boolean} = {}) => {
        if(this.initializing) {
            this.logger.warn(`Already trying to initialize, cannot attempt while an existing initialization attempt is running.`);
            return;
        }
        return await this.initialize(options);
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

    public buildTransformRules() {
        try {
            this.doBuildTransformRules();
        } catch (e) {
            this.buildOK = false;
            throw new TransformRulesError('Could not build playTransform rules. Check your configuration is valid.', {cause: e});
        }
        try {
            const ruleCount = countRegexes(this.transformRules);
            this.regexCache = cacheFunctions(ruleCount);
        } catch (e) {
            this.logger.warn(new TransformRulesError('Failed to count number of rule regexes for caching but will continue will fallback to 100', {cause: e}));
        }
    }

    protected doBuildTransformRules() {
        const {
            options: {
                playTransform
            } = {}
        } = this.config;

        if (playTransform === undefined) {
            this.transformRules = {};
            return;
        }

        const {
            preCompare: preConfig,
            compare: {
                candidate: candidateConfig,
                existing: existingConfig,
            } = {},
            postCompare: postConfig
        } = playTransform;

        let preCompare,
            candidate,
            existing,
            postCompare;

        try {
            preCompare = configPartsToStrongParts(preConfig)
        } catch (e) {
            throw new Error('preCompare was not valid', {cause: e});
        }

        try {
            candidate = configPartsToStrongParts(candidateConfig)
        } catch (e) {
            throw new Error('candidate was not valid', {cause: e});
        }

        try {
            existing = configPartsToStrongParts(existingConfig)
        } catch (e) {
            throw new Error('existing was not valid', {cause: e});
        }

        try {
            postCompare = configPartsToStrongParts(postConfig)
        } catch (e) {
            throw new Error('postCompare was not valid', {cause: e});
        }

        this.transformRules = {
            preCompare,
            compare: {
                candidate,
                existing,
            },
            postCompare,
        }
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

    public transformPlay = (play: PlayObject, hookType: TransformHook, log?: boolean) => {

        let logger: Logger;
        const labels = ['Play Transform', hookType];
        const getLogger = () => logger !== undefined ? logger : childLogger(this.logger, labels);

        try {
            let hook: PlayTransformPartsArray<ConditionalSearchAndReplaceRegExp> | undefined;

            switch (hookType) {
                case TRANSFORM_HOOK.preCompare:
                    hook = this.transformRules.preCompare;
                    break;
                case TRANSFORM_HOOK.candidate:
                    hook = this.transformRules.compare?.candidate;
                    break;
                case TRANSFORM_HOOK.existing:
                    hook = this.transformRules.compare?.existing;
                    break;
                case TRANSFORM_HOOK.postCompare:
                    hook = this.transformRules.postCompare;
                    break;
            }

            if (hook === undefined) {
                return play;
            }

            let transformedPlay: PlayObject = play;
            const transformDetails: string[] = [];
            for(const hookItem of hook) {
                const newTransformedPlay = transformPlayUsingParts(transformedPlay, hookItem, {
                    logger: getLogger,
                    regex: {
                        searchAndReplace: this.regexCache.searchAndReplace,
                        testMaybeRegex: this.regexCache.testMaybeRegex,
                    }
                });
                if(!deepEqual(newTransformedPlay, transformedPlay)) {
                    transformDetails.push(buildTrackString(transformedPlay, {include: ['artist', 'track', 'album']}));
                }
                transformedPlay = newTransformedPlay;
            }

            if(transformDetails.length > 0) {
                let transformStatements = [`Original: ${buildTrackString(play, {include: ['artist', 'track', 'album']})}`];
                const shouldLog = log ?? this.config.options?.playTransform?.log ?? false;
                if (shouldLog === true || shouldLog === 'all') {
                    if(shouldLog === 'all') {
                        transformStatements = transformStatements.concat(transformDetails.map(x => `=> ${x}`));
                    } else {
                        transformStatements.push(`=> ${transformDetails[transformDetails.length - 1]}`);
                    }
                    this.logger.debug({labels: [...labels, hookType]}, `Transform Pipeline:\n${transformStatements.join('\n')}`);
                }
            }
            return transformedPlay;
        } catch (e) {
            getLogger().warn(new Error(`Unexpected error occurred, returning original play.`, {cause: e}));
            return play;
        }
    }

    public additionalApiData(): Record<string, any> {
        return {};
    }
}
