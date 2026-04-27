import { childLogger, Logger } from "@foxxmd/logging";
import {
    cacheFunctions,
} from "@foxxmd/regex-buddy-core";
import { LifecycleStep, PlayData, PlayObject, TransformResult } from "../../core/Atomic.js";
import { buildPlayHumanDiffable, buildTrackString } from "../../core/StringUtils.js";
import { CommonClientConfig } from "./infrastructure/config/client/index.js";
import { CommonSourceConfig } from "./infrastructure/config/source/index.js";
import { mergeSimpleError, SimpleError, SkipTransformStageError, StagePrerequisiteError, StageTransformError, TransformRulesError } from "./errors/MSErrors.js";
import {
    FLOW_CONTROL_TERM,
    PlayTransformRules,
    StageConfig,
    TRANSFORM_HOOK,
    TransformHook
} from "./infrastructure/Transform.js";
import AbstractInitializable from "./AbstractInitializable.js";
import TransformerManager from "./transforms/TransformerManager.js";
import { getRoot } from "../ioc.js";
import { nanoid } from "nanoid";
import { isDebugMode } from "../utils.js";
import { findCauseByReference } from "../utils/ErrorUtils.js";
import { hashObject, parseArrayFromMaybeString } from "../utils/StringUtils.js";
import { metaInvariantTransform, playContentInvariantTransform } from "../utils/PlayComparisonUtils.js";
import { MSCache } from "./Cache.js";
import { diffObjects, diffObjectsConsoleOutput, patchObject } from "../../core/DataUtils.js";
import clone from "clone";
import { loggerNoop } from "./MaybeLogger.js";
import { objectsEqual } from "../utils/DataUtils.js";
import { RetentionOptions } from "./infrastructure/config/database.js";
import { getRetentionCompactAfterFromEnv, getRetentionDeleteAfterFromEnv, isCompactableProperty, parseRetentionOptions, parseRetentionOptionsDurations } from "./database/Database.js";
import { DbConcrete } from "./database/drizzle/drizzleUtils.js";
import { ComponentSelect } from "./database/drizzle/drizzleTypes.js";
import { DrizzlePlayRepository } from "./database/drizzle/repositories/PlayRepository.js";
import { ClientType } from "./infrastructure/config/client/clients.js";
import { SourceType } from "./infrastructure/config/source/sources.js";
import { DrizzleComponentRepository } from "./database/drizzle/repositories/ComponentRepository.js";

export type AbstractComponentConfig = (CommonClientConfig | CommonSourceConfig) & { transformManager?: TransformerManager };

export default abstract class AbstractComponent extends AbstractInitializable {

    declare config: CommonClientConfig | CommonSourceConfig;

    transformRules: PlayTransformRules = {};
    regexCache!: ReturnType<typeof cacheFunctions>;
    protected transformManager: TransformerManager;
    protected cache: MSCache;
    protected db: DbConcrete;
    protected componentRepo: DrizzleComponentRepository;
    protected dbComponent: ComponentSelect;
    protected retentionOpts: RetentionOptions;

    protected componentType: 'source' | 'client';
    type: ClientType | SourceType;

    protected constructor(config: AbstractComponentConfig) {
        super(config);
        this.transformManager = config.transformManager ?? getRoot().items.transformerManager;
        this.cache = getRoot().items.cache();
        this.db = getRoot().items.db();
        this.componentRepo = new DrizzleComponentRepository(this.db, {logger: this.logger});
        const cProps = config.options?.retention?.compact ?? parseArrayFromMaybeString(process.env.COMPACT_PROPERTIES, {lower: true});
        if(!cProps.every(isCompactableProperty)) {
            throw new SimpleError(`Compactable properties must be one of 'transform' or 'input'. Given: ${cProps.join(',')}`);
        }
        this.retentionOpts = {
            deleteAfter: parseRetentionOptionsDurations(config.options?.retention?.deleteAfter, getRetentionDeleteAfterFromEnv()),
            compactAfter: parseRetentionOptions(config.options?.retention?.compactAfter, getRetentionCompactAfterFromEnv()),
            compact: cProps
        };
    }

    protected postCache(): Promise<void> {
        try {
            this.buildTransformRules();
            return;
        } catch (e) {
            throw e;
        }
    }

    protected async doBuildDatabase(): Promise<true | string | undefined> {
        super.doBuildDatabase();

        let name: string;
        if('name' in this) {
            name = this.name as string;
        }

        this.dbComponent = await this.componentRepo.findOrInsert({
            mode: this.componentType,
            type: this.type,
            uid: this.config.id ?? this.config.name ?? name,
            name: this.config.name ?? name
        });
        return true;
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

        let preCompare: StageConfig[],
            candidate: StageConfig[],
            existing: StageConfig[],
            postCompare: StageConfig[];

        const builtHooks: string[] = [];
        const emptyHooks: string[] = [];
        try {
            preCompare = this.transformPartToStrong(preConfig);
            if(preCompare === undefined) {
                emptyHooks.push('preCompare')
            } else {
                builtHooks.push(`preCompare => ${preCompare.map(x => `${x.type}${x.name !== undefined ? `-${x.name}` : ''}`)}`);
            }
        } catch (e) {
            throw new Error('preCompare was not valid', {cause: e});
        }

        try {
            candidate = this.transformPartToStrong(candidateConfig);
            if(candidate === undefined) {
                emptyHooks.push('candidate')
            } else {
                builtHooks.push(`canidate => ${candidate.map(x => `${x.type}${x.name !== undefined ? `-${x.name}` : ''}`)}`);
            }
        } catch (e) {
            throw new Error('candidate was not valid', {cause: e});
        }

        try {
            existing = this.transformPartToStrong(existingConfig);
             if(existing === undefined) {
                emptyHooks.push('existing')
            } else {
                builtHooks.push(`existing => ${existing.map(x => `${x.type}${x.name !== undefined ? `-${x.name}` : ''}`)}`);
            }
        } catch (e) {
            throw new Error('existing was not valid', {cause: e});
        }

        try {
            postCompare = this.transformPartToStrong(postConfig);
             if(postCompare === undefined) {
                emptyHooks.push('postCompare')
            } else {
                builtHooks.push(`postCompare => ${postCompare.map(x => `${x.type}${x.name !== undefined ? `-${x.name}` : ''}`)}`);
            }
        } catch (e) {
            throw new Error('postCompare was not valid', {cause: e});
        }

        this.logger.debug(`Hooks built! Empty: ${emptyHooks.join(', ')} | Configured: ${builtHooks.length === 0 ? 'None' : `\n${builtHooks.join('\n')}`}`);

        this.transformRules = {
            preCompare,
            compare: {
                candidate,
                existing,
            },
            postCompare,
        }
    }

    public retentionCleanup = async () => {
        if(this.databaseOK !== true) {
            this.logger.warn(`Cannot run retention cleanup because ${this.componentType} database state is not OK`);
            return;
        }
        try {
            const repo = new DrizzlePlayRepository(this.db, {logger: this.logger});
            await repo.retentionCleanup(this.dbComponent.id, this.componentType, this.retentionOpts);
        } catch (e) {
            this.logger.warn(new Error('Failed to do retention cleanup', {cause: e}));
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

    public transformPlay = async (play: PlayObject, hookType: TransformHook, log?: boolean | 'all') => {

        let logger: Logger;

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

            const asyncId = nanoid(6);
            logger = childLogger(this.logger, ['Play Transform', hookType, asyncId]);

            const shouldLog = log ?? this.config.options?.playTransform?.log ?? isDebugMode();

            const transformHash = `playTransform-${hashObject(hook)}-${hashObject(playContentInvariantTransform(play))}`;
            const cachedSteps = await this.cache.cacheTransform.get<LifecycleStep[]>(transformHash);
            if(cachedSteps !== undefined) {
                logger.trace(`Cache hit for Steps => ${transformHash}`);
                //return cachedTransformPlay;
            }

            logger.debug(`Transform start for => ${buildTrackString(play)}`);
            let transformedPlay: PlayObject = clone(play);
            let cacheOk: boolean = true,
            generateSteps = true;
            const steps: LifecycleStep[] = [];

            const opts = {
                logger,
                asyncId
            }

            if(cachedSteps !== undefined) {
                generateSteps = false;
                // don't re-cache cached steps
                cacheOk = false;
                try {
                    // only patch play if steps didn't end in a failure that we are okay with returning partial from
                    let shouldTransform = true;
                    const lastCachedStep = cachedSteps[cachedSteps.length - 1];
                    if(lastCachedStep.error !== undefined && lastCachedStep.flowKnownState !== 'skip' && !lastCachedStep.returnPartial) {
                        shouldTransform = false;
                    }

                    for(const s of cachedSteps) {
                        steps.push({...s, cached: true});
                        if(shouldTransform && s.patch !== undefined) {
                            transformedPlay.data = patchObject(transformedPlay.data, s.patch); // jdiff.patch(clone(transformedPlay.data),s.patch);
                        }
                    } 
                } catch (e) {
                    logger.warn(new Error('Error occurred while trying to use cached steps. Falling back to generating fresh transform steps', {cause: e}));
                    generateSteps = true;
                }
            }
            if(generateSteps) {
                for(const hookItem of hook) {
                    const [step, stepPlay] = await this.generateStepFromStage(transformedPlay, hookItem, hookType, opts);
                    steps.push(step);
                    cacheOk = step.error === undefined || (step.error !== undefined && step.flowKnownState !== undefined);
                    if(step.flowResult === FLOW_CONTROL_TERM.stop) {
                        if(step.error !== undefined && step.flowKnownState !== 'skip' && !step.returnPartial) {
                            // revert to original play but keep steps for paper trail
                            transformedPlay = play;
                            transformedPlay.meta.lifecycle.steps = steps;
                        } else {
                            transformedPlay = stepPlay;
                        }
                        break;
                    } else {
                        transformedPlay = stepPlay;
                    }
                }
            }

            const historyToDiff: {name: string, data?: PlayData}[] = [
                {name: 'Pre Transform', data: play.data}
            ];
            if(steps.length > 0 && transformedPlay.meta?.lifecycle?.steps === undefined) {
                const {
                    meta: {
                        lifecycle: {
                            steps = [],
                            ...lifecycleRest
                        },
                    } = {}
                } = transformedPlay;
                transformedPlay.meta.lifecycle = {
                    ...lifecycleRest,
                    steps
                }
            }
            steps.forEach((s, index) => {
                const existingStepIndex = transformedPlay.meta.lifecycle.steps.findIndex(x => x.name === 'hookType' && x.source === this.getIdentifier());
                if(existingStepIndex !== -1) {
                    transformedPlay.meta.lifecycle.steps[existingStepIndex] = s;
                } else {
                    transformedPlay.meta.lifecycle.steps.push(s);
                }

                if(shouldLog === 'all') {
                    if(s.patch === undefined) {
                        historyToDiff.push({name: `${s.source}-${s.name}`});
                    } else {
                        const patched = patchObject(historyToDiff[historyToDiff.length - 1].data, s.patch);
                        historyToDiff.push({name: `${s.source}-${s.name}${s.cached ? ' (Cached)' : ''}`, data: patched});
                    }
                }
            });
            if(shouldLog !== false) {
                if(steps.filter(x => x.patch !== undefined).length === 0) {
                    logger.debug('Transform Diff: No Change');
                } else {
                    const diffs: string[] = [];

                    historyToDiff.forEach((curr, index) => {
                        if(index === 0) {
                            return;
                        }
                        const last = historyToDiff[index - 1];
                        if(curr.data === undefined) {
                            diffs.push(`${last.name} => ${curr.name} -- No Change`);
                        } else {
                            const formattedDiff = diffObjectsConsoleOutput(last.data, curr.data);
                            diffs.push(`${last.name} => ${curr.name}\n${formattedDiff}`);
                        }
                    });

                    if(shouldLog === true || steps.filter(x => x.patch !== undefined).length > 2) {
                        const finalData = transformedPlay.data;
                        const formattedDiff = diffObjectsConsoleOutput(play.data, finalData, true);
                        diffs.push(`Original => Final\n${formattedDiff}`);
                    }

                    logger.debug(`Transform Diff\n${diffs.join('\n')}`);
                }
            }

            if(cacheOk) {
                await this.cache.cacheTransform.set<LifecycleStep[]>(transformHash, steps, '2m');
            }

            return transformedPlay;
        } catch (e) {
            const err = new Error(`Unexpected error occurred, returning original play.`, {cause: e});
            if(logger === undefined) {
                this.logger.warn(err);
            } else {
                logger.warn(err);
            }
            return play;
        }
    }

    protected generateStepFromStage = async (playTruth: PlayObject, hookItem: StageConfig, hookType: TransformHook, opts: { logger?: Logger, asyncId?: string } = {}): Promise<[LifecycleStep, PlayObject]> => {
        const {
            onSuccess = 'continue',
            onFailure = 'stop',
            onSkip = 'continue',
            failureReturnPartial = false
        } = hookItem;

        const {
            logger = loggerNoop,
            asyncId = nanoid(6)
        } = opts;

        const stepName = `${hookType} - ${hookItem.type} - ${hookItem.name}`
        const existingStepIndex = playTruth.meta.lifecycle.steps.findIndex(x => x.name === stepName && x.source === this.getIdentifier());
        const step: LifecycleStep = existingStepIndex !== -1 && playTruth.meta.lifecycle.steps[existingStepIndex] !== undefined ? playTruth.meta.lifecycle.steps[existingStepIndex] : {
            name: stepName,
            source: this.getIdentifier(),
        }

        let newTransformedPlay: PlayObject,
            stageName: string = 'Unnamed',
            err: Error;
        try {
            [newTransformedPlay, stageName] = await this.transformManager.handleStage(hookItem, playTruth, asyncId);
            newTransformedPlay = clone(newTransformedPlay);
        } catch (e) {
            err = e;
            if (e instanceof StageTransformError) {
                stageName = e.stageName;
            }
        }

        if (err !== undefined) {
            const merged = mergeSimpleError(err);
            step.error = merged;

            const skipError = findCauseByReference(err, SkipTransformStageError);
            if (skipError !== undefined) {
                let skipMsg = `Stage '${stageName}' was skipped`;
                step.flowResult = onSkip;
                step.flowKnownState = 'skip';

                if (onSkip === 'stop') {
                    skipMsg += ' and will stop transform due to onSkip: stop';
                }
                step.flowReason = skipMsg;

                logger.debug(merged, skipMsg);
            } else {
                step.flowResult = onFailure;
                let reason: string;

                const reqError = findCauseByReference(err, StagePrerequisiteError);
                if (reqError !== undefined) {
                    reason = 'Transform could not be completed due to prerequisite failure';
                    step.flowKnownState = 'prereq';
                } else {
                    reason = 'Transform encountered an error';
                }

                if (onFailure === 'continue') {
                    reason += ' but will continue due to onFailure: continue';
                    logger.warn(merged, reason);
                } else {
                    if (failureReturnPartial) {
                        reason += ' | Preserving play transformations up to this point due to failureReturnPartial=true';
                        step.returnPartial = true;
                    }

                    logger[reqError !== undefined ? 'warn' : 'error'](merged, reason);
                }
                step.flowReason = reason;

                return [step, playTruth];
            }
        } else {
            step.flowResult = onSuccess;

            if (!objectsEqual(playTruth.data, newTransformedPlay.data)) {
                const o = JSON.parse(JSON.stringify(playTruth.data));
                const t = JSON.parse(JSON.stringify(newTransformedPlay.data));
                const patch = diffObjects(o, t); // jdiff.diff(o, t);
                step.patch = patch;
            }

            if (newTransformedPlay.meta.lifecycleInputs?.length > 0) {
                step.inputs = clone(newTransformedPlay.meta.lifecycleInputs)
            } else if (playTruth.meta.lifecycleInputs?.length > 0) {
                logger.warn({ label: `${hookItem.type} - ${hookItem.name}` }, `Should only be adding inputs to transformed play!`);
                step.inputs = clone(playTruth.meta.lifecycleInputs)
            }

            delete newTransformedPlay.meta.lifecycleInputs;
        }

        return [step, newTransformedPlay];
    }
}
