import { childLogger, Logger } from "@foxxmd/logging";
import { searchAndReplace, SearchAndReplaceRegExp } from "@foxxmd/regex-buddy-core";
import { compare } from "compare-versions";
import { ObjectPlayData, PlayData, PlayObject } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";
import { configPartsToStrongParts, configValToSearchReplace } from "../utils.js";
import { hasNodeNetworkException } from "./errors/NodeErrors.js";
import { hasUpstreamError } from "./errors/UpstreamError.js";
import { PlayTransformParts, PlayTransformRules, TRANSFORM_HOOK, TransformHook } from "./infrastructure/Atomic.js";
import { CommonClientConfig } from "./infrastructure/config/client/index.js";
import { CommonSourceConfig } from "./infrastructure/config/source/index.js";

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

    logger: Logger;

    protected constructor(config: CommonClientConfig | CommonSourceConfig) {
        this.config = config;
    }

    initialize = async () => {
        this.logger.debug('Attempting to initialize...');
        try {
            this.initializing = true;
            await this.buildInitData();
            this.buildTransformRules();
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

    public buildTransformRules() {
        try {
            this.doBuildTransformRules();
        } catch (e) {
            this.buildOK = false;
            throw new Error('Could not build playTransform rules. Check your configuration is valid.', {cause: e});
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
    testAuth = async (force: boolean = false) => {
        if(!this.requiresAuth) {
            return;
        }
        if(this.authed && !force) {
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

    public transformPlay = (play: PlayObject, hookType: TransformHook, log?: boolean) => {

        let logger: Logger;
        const labels = ['Play Transform', hookType];
        const getLogger = () => logger !== undefined ? logger : childLogger(this.logger, labels);

        try {
            let hook: PlayTransformParts<SearchAndReplaceRegExp> | undefined;

            switch (hookType) {
                case TRANSFORM_HOOK.preCompare:
                    hook = this.transformRules.preCompare;
                    break;
                case TRANSFORM_HOOK.candidate:
                    hook = this.transformRules.compare?.candidate;
                    break;
                case TRANSFORM_HOOK.existing:
                    hook = this.transformRules.compare?.candidate;
                    break;
                case TRANSFORM_HOOK.postCompare:
                    hook = this.transformRules.postCompare;
                    break;
            }

            if (hook === undefined) {
                return play;
            }

            const {
                data: {
                    track,
                    artists,
                    albumArtists,
                    album
                } = {}
            } = play;

            const transformedPlayData: Partial<ObjectPlayData> = {};

            //const results: [string, string, string][] = [];
            let isTransformed = false;

            if (hook.title !== undefined && track !== undefined) {
                try {
                    const t = searchAndReplace(track, hook.title);
                    if (t !== track) {
                        //results.push(['title', track, t]);
                        transformedPlayData.track = t;
                        //transformedPlay.data.track = t;
                        isTransformed = true;
                    }
                } catch (e) {
                    getLogger().warn(new Error(`Failed to transform title: ${track}`, {cause: e}));
                }
            }

            if (hook.artists !== undefined && artists !== undefined && artists.length > 0) {
                const transformedArtists: string[] = [];
                let anyArtistTransformed = false;
                for (const artist of artists) {
                    try {
                        const t = searchAndReplace(artist, hook.artists);
                        if (t !== artist) {
                            anyArtistTransformed = true;
                            isTransformed = true;
                        }
                        transformedArtists.push(t);
                    } catch (e) {
                        getLogger().warn(new Error(`Failed to transform artist: ${artist}`, {cause: e}));
                        transformedArtists.push(artist);
                    }
                }
                if(anyArtistTransformed) {
                    transformedPlayData.artists = transformedArtists;
                }
                //transformedPlay.data.artists = transformedArtists;
                // if (anyTransformed) {
                //     //results.push(['artists', artists.join(' / '), transformedArtists.join(' / ')]);
                // }
            }

            if (hook.artists !== undefined && albumArtists !== undefined && albumArtists.length > 0) {
                const transformedArtists: string[] = [];
                let anyArtistTransformed = false;
                for (const artist of albumArtists) {
                    try {
                        const t = searchAndReplace(artist, hook.artists);
                        if (t !== artist) {
                            anyArtistTransformed = true;
                            isTransformed = true;
                        }
                        transformedArtists.push(t);
                    } catch (e) {
                        getLogger().warn(new Error(`Failed to transform albumArtist: ${artist}`, {cause: e}));
                        transformedArtists.push(artist);
                    }
                }
                if(anyArtistTransformed) {
                    transformedPlayData.albumArtists = transformedArtists;
                }
                // transformedPlay.data.albumArtists = transformedArtists;
                // if (anyTransformed) {
                //     results.push(['albumArtists', artists.join(' / '), transformedArtists.join(' / ')]);
                // }
            }

            if (hook.album !== undefined && album !== undefined) {
                try {
                    const t = searchAndReplace(album, hook.album);
                    if (t !== album) {
                        isTransformed = true;
                        transformedPlayData.album = t;
                        // results.push(['album', album, t]);
                        // transformedPlay.data.album = t;
                    }
                } catch (e) {
                    getLogger().warn(new Error(`Failed to transform album: ${album}`, {cause: e}));
                }
            }

            if(isTransformed) {

                const transformedPlay = {
                    ...play,
                    data: {
                        ...play.data,
                        ...transformedPlayData
                    }
                }

                const shouldLog = log ?? this.config.options?.playTransform?.log ?? true;
                if(shouldLog) {
                    this.logger.debug({labels}, `Play transformed by ${hookType}:
Original    : ${buildTrackString(play, {include: ['artist', 'track', 'album']})}
Transformed : ${buildTrackString(transformedPlay, {include: ['artist', 'track', 'album']})}
`);
                }

                return transformedPlay;
            }

//             if (results.length > 0 && log) {
//                 this.logger.debug({labels}, `Play transformed by ${hookType}:
// ${results.map(x => `${x[0]}: ${x[1]} => ${x[2]}`).join('\n')}`);
//             }

            return play;
        } catch (e) {
            getLogger().warn(new Error(`Unexpected error occurred, returning original play.`, {cause: e}));
            return play;
        }
    }
}
