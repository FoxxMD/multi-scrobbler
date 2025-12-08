import { childLogger, Logger } from "@foxxmd/logging";
import {
    cacheFunctions,
} from "@foxxmd/regex-buddy-core";
import deepEqual from 'fast-deep-equal';
import { Simulate } from "react-dom/test-utils";
import { PlayData, PlayObject, TransformResult } from "../../core/Atomic.js";
import { buildPlayHumanDiffable, buildTrackString } from "../../core/StringUtils.js";
import { CommonClientConfig } from "./infrastructure/config/client/index.js";
import { CommonSourceConfig } from "./infrastructure/config/source/index.js";
import { TransformRulesError } from "./errors/MSErrors.js";
import {
    PlayTransformRules,
    StageConfig,
    TRANSFORM_HOOK,
    TransformHook
} from "./infrastructure/Transform.js";
import AbstractInitializable from "./AbstractInitializable.js";
import play = Simulate.play;
import TransformerManager from "./transforms/TransformerManager.js";
import { getRoot } from "../ioc.js";
import { nanoid } from "nanoid";
import {diffStringsUnified, DiffOptionsColor} from 'jest-diff';
import chalk from 'chalk';
import { isDebugMode } from "../utils.js";

export default abstract class AbstractComponent extends AbstractInitializable {

    declare config: CommonClientConfig | CommonSourceConfig;

    transformRules: PlayTransformRules = {};
    regexCache!: ReturnType<typeof cacheFunctions>;
    protected transformManager: TransformerManager;

    protected constructor(config: CommonClientConfig | CommonSourceConfig) {
        super(config);
        this.transformManager = getRoot().items.transformerManager;
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
        this.logger.debug('Building transformer rules...');
        try {
            this.doBuildTransformRules();
        } catch (e) {
            this.buildOK = false;
            throw new TransformRulesError('Could not build playTransform rules. Check your configuration is valid.', {cause: e});
        }
        try {
            //const ruleCount = countRegexes(this.transformRules);
            this.regexCache = cacheFunctions(200);
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
            this.logger.debug(`No rules found under property 'playTransform'`);
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

        const builtHooks: string[] = [];
        const emptyHooks: string[] = [];
        try {
            preCompare = this.transformPartToStrong(preConfig);
            if(preCompare === undefined) {
                emptyHooks.push('preCompare')
            } else {
                builtHooks.push('preCompare');
            }
        } catch (e) {
            throw new Error('preCompare was not valid', {cause: e});
        }

        try {
            candidate = this.transformPartToStrong(candidateConfig);
            if(candidate === undefined) {
                emptyHooks.push('candidate')
            } else {
                builtHooks.push('candidate');
            }
        } catch (e) {
            throw new Error('candidate was not valid', {cause: e});
        }

        try {
            existing = this.transformPartToStrong(existingConfig);
             if(existing === undefined) {
                emptyHooks.push('existing')
            } else {
                builtHooks.push('existing');
            }
        } catch (e) {
            throw new Error('existing was not valid', {cause: e});
        }

        try {
            postCompare = this.transformPartToStrong(postConfig);
             if(postCompare === undefined) {
                emptyHooks.push('postCompare')
            } else {
                builtHooks.push('postCompare');
            }
        } catch (e) {
            throw new Error('postCompare was not valid', {cause: e});
        }

        this.logger.debug(`Hooks built. Configured: ${builtHooks.join(', ')} | Empty: ${emptyHooks.join(', ')}`);

        this.transformRules = {
            preCompare,
            compare: {
                candidate,
                existing,
            },
            postCompare,
        }
    }

    protected transformPartToStrong(data: any) {
        if(data === undefined) {
            return undefined;
        }
        // default to user transform type for backward compatibility
        const partArr = (Array.isArray(data) ? data : [data]).map(x => ({type: 'user', ...x}));

        return partArr.map(x => this.transformManager.parseTransformerConfig(x));
    }

    public transformPlay = async (play: PlayObject, hookType: TransformHook, log?: boolean) => {


        const asyncId = nanoid(6);
        let logger = childLogger(this.logger, ['Play Transform', hookType, asyncId]);

        try {
            let hook: StageConfig[];

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

            logger.debug(`Transform start for => ${buildTrackString(play)}`);
            let transformedPlay: PlayObject = play;
            let transformHistory: TransformResult[] = [];
            for(const hookItem of hook) {

                const {
                    onSuccess = 'continue',
                    onFailure = 'stop',
                    failureReturnPartial = false
                } = hookItem;

                let newTransformedPlay: PlayObject,
                stageName: string,
                err: Error;
                try {
                    [newTransformedPlay, stageName] = await this.transformManager.handleStage(hookItem, transformedPlay, asyncId);
                } catch (e) {
                    err = e;
                }

                if(err !== undefined) {
                    if(onFailure === 'continue') {
                        logger.warn(new Error(`A transform encountered an error but continuing due to onFailure: continue`, {cause: err}));
                    } else {
                        logger.error(new Error(`Transform encountered an error`, {cause: err}));
                        if(!failureReturnPartial) {
                            // rewind to original play so we don't return partial transform
                            transformedPlay = play;
                            transformHistory = [];
                        }
                        break;
                    }
                }

                transformHistory.push({
                    type: hookItem.type,
                    name: stageName,
                    play: newTransformedPlay.data
                });

                transformedPlay = newTransformedPlay;

                if(err === undefined && onSuccess === 'stop') {
                    logger.debug(`${nanoid} Stopping transform due to onSuccess: stop`);
                    break;
                }
            }

            const shouldLog = log ?? this.config.options?.playTransform?.log ?? isDebugMode();

            if(transformedPlay.meta.transforms === undefined) {
                transformedPlay.meta.transforms = {
                    original: play.data
                };
            }
            if(shouldLog !== false) {
                if(transformHistory.length === 0) {
                    logger.debug('Transform Diff: No Change');
                }
                const historyToDiff: {name: string, data: PlayData}[] = [
                    {name: 'Original', data: transformedPlay.meta.transforms.original}
                ];
                if(shouldLog === true) {
                    const last = transformHistory[transformHistory.length - 1];
                    historyToDiff.push({name: `${last.type}-${last.name}`, data: last.play});
                } else {
                    for(const t of transformHistory) {
                        historyToDiff.push({name: `${t.type}-${t.name}`, data: t.play})
                    }
                }
                const diffs: string[] = [];
                historyToDiff.forEach((curr, index) => {
                    if(index === 0) {
                        return;
                    }
                    const last = historyToDiff[index - 1];
                    if(deepEqual(last.data, curr.data)) {
                        diffs.push(`${last.name} => ${curr.name} -- No Change`);
                    } else {
                        diffs.push(diffStringsUnified(
                        buildPlayHumanDiffable(last.data, {expandMeta: true}), 
                        buildPlayHumanDiffable(curr.data, {expandMeta: true}),
                        {
                            aAnnotation: last.name,
                            aColor: chalk.red,
                            bAnnotation: curr.name,
                            bColor: chalk.green
                        }
                    ))
                    }
                });
                logger.debug(`Transform Diff\n${diffs}`)
            }
            const previousHistory = transformedPlay.meta.transforms[hookType] ?? [];
            transformedPlay.meta.transforms[hookType] = [...previousHistory, ...transformHistory];
            return transformedPlay;
        } catch (e) {
            logger.warn(new Error(`Unexpected error occurred, returning original play.`, {cause: e}));
            return play;
        }
    }
}
