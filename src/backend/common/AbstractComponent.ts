import { childLogger, Logger } from "@foxxmd/logging";
import {
    cacheFunctions,
} from "@foxxmd/regex-buddy-core";
import deepEqual from 'fast-deep-equal';
import { Simulate } from "react-dom/test-utils";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";

import {
    configPartsToStrongParts, countRegexes, transformPlayUsingParts
} from "../utils/PlayTransformUtils.js";
import { CommonClientConfig } from "./infrastructure/config/client/index.js";
import { CommonSourceConfig } from "./infrastructure/config/source/index.js";
import { TransformRulesError } from "./errors/MSErrors.js";
import {
    ConditionalSearchAndReplaceRegExp, PlayTransformPartsArray,
    PlayTransformRules,
    TRANSFORM_HOOK,
    TransformHook
} from "./infrastructure/Transform.js";
import AbstractInitializable from "./AbstractInitializable.js";
import play = Simulate.play;

export default abstract class AbstractComponent extends AbstractInitializable {

    declare config: CommonClientConfig | CommonSourceConfig;

    transformRules: PlayTransformRules = {};
    regexCache!: ReturnType<typeof cacheFunctions>;

    protected constructor(config: CommonClientConfig | CommonSourceConfig) {
        super(config);
    }

    protected postCache(): Promise<void> {
        try {
            this.buildTransformRules();
            return;
        } catch (e) {
            throw e;
        }
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
                if(hookItem.type === 'user') {
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
}
