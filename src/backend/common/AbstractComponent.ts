import { childLogger, type Logger } from "@foxxmd/logging";
import {
    cacheFunctions,
} from "@foxxmd/regex-buddy-core";
import type EventEmitter from "events";
import {COMPONENT_TYPE_CLIENT, INGRESS_QUEUE, isPlayObject, MONITORING_ORIGIN_SYSTEM, MONITORING_ORIGIN_USER, type ComponentType, type LifecycleInput, type LifecycleStep, type PlayData, type PlayObject} from "../../core/Atomic.ts";
import { buildTrackString, capitalize } from "../../core/StringUtils.ts";
import type {CommonClientConfig} from "./infrastructure/config/client/index.ts";
import type {CommonSourceConfig} from "./infrastructure/config/source/index.ts";
import { mergeSimpleError, SimpleError, SkipTransformStageError, StageChangeError, StagePrerequisiteError, StageTransformError, TransformRulesError } from "./errors/MSErrors.ts";
import {
    FLOW_CONTROL_TERM,
    type PlayTransformRules,
    type StageConfig,
    TRANSFORM_HOOK,
    type TransformHook
} from "../../core/Transform.ts";
import AbstractInitializable from "./AbstractInitializable.ts";
import type TransformerManager from "./transforms/TransformerManager.ts";
import { getRoot } from "../ioc.ts";
import { nanoid } from "nanoid";
import { isDebugMode } from "../utils.ts";
import { findCauseByFunc, findCauseByReference } from "../utils/ErrorUtils.ts";
import { hashObject, normalizeStr, parseArrayFromMaybeString } from "../utils/StringUtils.ts";
import { playContentInvariantTransform } from "../utils/PlayComparisonUtils.ts";
import type { MSCache } from "./Cache.ts";
import { diffObjects, diffObjectsConsoleOutput, patchObject } from "../../core/DataUtils.ts";
import clone from "clone";
import { loggerNoop } from "./MaybeLogger.ts";
import { objectsEqual } from "../utils/DataUtils.ts";
import type {RetentionOptions} from "./infrastructure/config/database.ts";
import { getRetentionCompactAfterFromEnv, getRetentionDeleteAfterFromEnv, isCompactableProperty, parseRetentionOptions, parseRetentionOptionsDurations } from "./database/Database.ts";
import type {DbConcrete} from "./database/drizzle/drizzleUtils.ts";
import type {ComponentSelect, PlayEventSelect, PlaySelect, PlaySelectWithQueueStates, PlayWith, QueueStateSelect} from "./database/drizzle/drizzleTypes.ts";
import { DrizzlePlayRepository, playToRepositoryCreatePlayOpts } from "./database/drizzle/repositories/PlayRepository.ts";
import type {ClientType, MonitoringStatus, OptionalCacheUsage, PlayMatchResult, QueueContext} from "../../core/Atomic.ts";
import type {SourceType} from "../../core/Atomic.ts";
import { DrizzleComponentRepository } from "./database/drizzle/repositories/ComponentRepository.ts";
import dayjs, { type Dayjs } from "dayjs";
import { COMPONENT_STATE, type ComponentCommonApi, type ComponentCommonApiJson, type ComponentState, type PlayApiCommonDetailed } from "../../core/Api.ts";
import type {WebhookPayload} from "./infrastructure/config/health/webhooks.ts";
import type { ElementOf, MarkRequired } from "ts-essentials";
import { serializeError } from "serialize-error";
import { DrizzleQueueRepository } from "./database/drizzle/repositories/QueueRepository.ts";
import { DrizzlePlayEventsRepository } from "./database/drizzle/repositories/PlayEventsRepository.ts";
import { entityIsPlayEntity, queueStateToPlayEvent, stateChangeToPlayEvent } from "./database/drizzle/entityUtils.ts";
import pMap from "p-map";
import type { Gauge } from 'prom-client';

export type AbstractComponentConfig = (CommonClientConfig | CommonSourceConfig) & { transformManager?: TransformerManager };

const noopTransform = async (x) => x;

export default abstract class AbstractComponent extends AbstractInitializable {

    declare config: CommonClientConfig | CommonSourceConfig;

    transformRules: PlayTransformRules = {};
    regexCache!: ReturnType<typeof cacheFunctions>;
    protected transformManager: TransformerManager;
    protected cache: MSCache;
    protected db: DbConcrete;
    protected componentRepo!: DrizzleComponentRepository;
    protected dbComponent!: ComponentSelect;
    public playRepo!: DrizzlePlayRepository;
    protected queueRepo!: DrizzleQueueRepository;
    protected playEventsRepo!: DrizzlePlayEventsRepository;
    componentId!: number;
    protected retentionOpts: RetentionOptions;
    status: string = 'Waiting to initialize...';
    emitter: EventEmitter;

    monitoringActivity?: boolean | undefined;
    monitoringActivityDefault: boolean = true;

    protected componentType: ComponentType;
    type: ClientType | SourceType;
    name: string;

    lastActiveAt?: Dayjs;
    lastReadyAt?: Dayjs;
    protected lastUpdatedComponentDatesAt?: Dayjs

    queuedLength: number = 0;

    protected queuedGauge!: Gauge;

    abstract existingPlay(playObjPre: PlayObject, existingScrobbles: PlayObject[], log?: boolean): Promise<PlayMatchResult>

    protected constructor(config: AbstractComponentConfig) {
        super(config);
        this.transformManager = config.transformManager ?? getRoot().items.transformerManager;
        this.cache = getRoot().items.cache();
        const cProps = config.options?.retention?.compact ?? parseArrayFromMaybeString(process.env.COMPACT_PROPERTIES ?? 'input,transform', {lower: true});
        if(!cProps.every(isCompactableProperty)) {
            throw new SimpleError(`Compactable properties must be one of 'transform' or 'input'. Given: ${cProps.join(',')}`);
        }
        this.retentionOpts = {
            deleteAfter: parseRetentionOptionsDurations(config.options?.retention?.deleteAfter, getRetentionDeleteAfterFromEnv()),
            compactAfter: parseRetentionOptions(config.options?.retention?.compactAfter, getRetentionCompactAfterFromEnv()),
            compact: cProps
        };
    }

    public getUid() {
        return this.config?.id ?? this.config?.name ?? this.name;
    }

    protected getIdentifier() {
        return `${capitalize(this.type)} - ${this.name}`
    }
    protected getMachineId() {
        return `${this.type}-${this.name}`;
    }
    public getSafeExternalName() {
        return normalizeStr(this.name, {keepSingleWhitespace: false});
    }
    public getSafeExternalId() {
        return `${this.type}-${normalizeStr(this.name, {keepSingleWhitespace: false})}`;
    }

    protected getPrometheusLabels() {
        return {name: this.getSafeExternalName(), type: this.type};
    }

    protected postCache(): Promise<void> {
        try {
            this.buildTransformRules();
            return;
        } catch (e) {
            throw e;
        }
    }

    protected async postInitialize(): Promise<void> {
        await super.postInitialize();
        this.componentRepo.updateById(this.dbComponent.id, {lastReadyAt: dayjs()});
    }

    protected async doBuildDatabase(): Promise<true | string | undefined> {
        await super.doBuildDatabase();

        this.db = await getRoot().items.db();
        this.componentRepo = new DrizzleComponentRepository(this.db, {logger: this.logger});
        this.dbComponent = await this.componentRepo.findOrInsert({
            mode: this.componentType,
            type: this.type,
            uid: this.getUid(),
            name: this.config?.name ?? this.name
        });
        this.componentId = this.dbComponent.id;
        this.playRepo = new DrizzlePlayRepository(this.db, {logger: this.logger});
        this.queueRepo = new DrizzleQueueRepository(this.db, {logger: this.logger});
        this.playEventsRepo = new DrizzlePlayEventsRepository(this.db, {logger: this.logger});
        this.playRepo.componentId = this.dbComponent.id;
        this.queueRepo.componentId = this.dbComponent.id;
        this.lastActiveAt = this.dbComponent.lastActiveAt ?? undefined;
        this.lastReadyAt = this.dbComponent.lastReadyAt ?? undefined;
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

    public abstract stop(opts?: {reason?: string | Error}):  Promise<void>
    public abstract start(opts?: {forceInit?: boolean}):  Promise<boolean>

    public async restart(opts: { reason?: string | Error, forceInit?: boolean } = {}): Promise<void> {
        try {
            await this.stop(opts);
            await this.start(opts);
        } catch (e) {
            const err = new StageChangeError('Failed to restart', { cause: e });
            this.replaceErrors(err);
            throw err;
        }
    }

    public retentionCleanup = async () => {
        if(this.databaseOK !== true) {
            this.logger.warn(`Cannot run retention cleanup because ${this.componentType} database state is not OK`);
            return;
        }
        this.setStatus('Running retention cleanup');
        try {
            const repo = new DrizzlePlayRepository(this.db, {logger: this.logger});
            await repo.retentionCleanup(this.componentType, this.retentionOpts);
            this.setStatus('Retention cleanup finished');
        } catch (e) {
            const retentionErr = new Error('Failed to do retention cleanup', {cause: e});
            this.warnings.push(retentionErr);
            this.logger.warn(retentionErr);
            this.setStatus('Retention cleanup failed');
        }
    }

    protected transformPartToStrong(data: any) {
        if(data === undefined) {
            return undefined;
        }
        const partArr = (Array.isArray(data) ? data : [data]);

        return partArr.map(x => this.transformManager.parseTransformerConfig(x));
    }

    public transformPlay = async (play: PlayObject, hookType: TransformHook, transformOpts: {log?: boolean | 'all'} & OptionalCacheUsage = {}) => {

        const {
            log,
            useCachedResult = true
        } = transformOpts;

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
            const cachedSteps = useCachedResult ?  await this.cache.cacheTransform.get<LifecycleStep[]>(transformHash) : undefined;
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
                asyncId,
                useCachedResult
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
                        steps.push({...s, cached: true, createdAt: dayjs().toISOString()});
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
                            transformedPlay.lifecycle = steps;
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
            let isNew = false,
            diffFailure = false;
            if(steps.length > 0 && transformedPlay.lifecycle === undefined) {
                transformedPlay.lifecycle = steps;
                isNew = true;
            }
            const {
                lifecycle = []
            } = transformedPlay;
            steps.forEach((s, index) => {
                if(diffFailure) {
                    return;
                }
                const stepIdHint = `${s.source}-${s.hook}-${s.stageType}-${s.stageName}`;
                try {
                if(!isNew) {
                    const existingStepIndex = lifecycle.findIndex(x => x.stageName === s.stageName && x.stageType === s.stageType && x.hook === s.hook && x.source === this.getIdentifier());
                    if(existingStepIndex !== -1) {
                        transformedPlay.lifecycle[existingStepIndex] = s;
                    } else {
                        transformedPlay.lifecycle.push(s);
                    }
                }

                if(shouldLog === 'all') {
                    if(s.patch === undefined) {
                        historyToDiff.push({name: `${stepIdHint}`});
                    } else {
                        const lastTransformedData = historyToDiff[historyToDiff.findLastIndex(x => x.data !== undefined)].data;
                        const patched = patchObject(lastTransformedData, s.patch);
                        historyToDiff.push({name: `${stepIdHint} ${s.cached ? ' (Cached)' : ''}`, data: patched});
                    }
                }
                } catch (e) {
                    if(`patch` in s) {
                        this.logger.debug({
                            patch: s.patch,
                            playData: historyToDiff[historyToDiff.findLastIndex(x => x.data !== undefined)].data,
                            cached: s.cached
                        }, 'Patch and Play data context');
                    }
                    this.logger.warn(new SimpleError(`Error occurred while trying to generate diffed Plays for console logging on step ${stepIdHint} but will continue`, {cause: e}));
                    diffFailure = true;
                }
            });
            if(shouldLog !== false) {
                if(steps.filter(x => x.patch !== undefined).length === 0) {
                    logger.debug('Transform Diff: No Change');
                } else {
                    const diffs: string[] = [];

                    try {
                    let lastTransformed: ElementOf<typeof historyToDiff>;
                    historyToDiff.forEach((curr, index) => {
                        if(index === 0) {
                            lastTransformed = curr;
                            return;
                        }
                        const last = historyToDiff[index - 1];
                        if(curr.data === undefined) {
                            diffs.push(`${last.name} => ${curr.name} -- No Change`);
                        } else {
                            try {
                                const formattedDiff = diffObjectsConsoleOutput(lastTransformed.data, curr.data);
                                diffs.push(`${last.name} => ${curr.name}\n${formattedDiff}`);
                                lastTransformed = curr;
                            } catch(e) {
                                this.logger.debug({pre: lastTransformed.data, post: curr.data}, 'Compared Pre and Post play data');
                                throw e;
                            }
                        }
                    });
                    } catch (e) {
                         this.logger.warn(new SimpleError('Error occurred while trying to generate Play diffs for console but will continue', {cause: e}));
                         diffFailure = true;
                    }

                    if(shouldLog === true || steps.filter(x => x.patch !== undefined).length > 2) {
                        const finalData = transformedPlay.data;
                        try {
                            const formattedDiff = diffObjectsConsoleOutput(play.data, finalData, true);
                            diffs.push(`Original => Final\n${formattedDiff}`);
                        } catch (e) {
                            this.logger.warn(new SimpleError('Error occurred while trying to generate Play diffs for console but will continue', {cause: e}));
                            diffFailure = true;
                        }
                    }
                    if(diffFailure) {
                        diffs.push('A failure during diff generation occurred but the transform was successful.');
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

    protected generateStepFromStage = async (playTruth: PlayObject, hookItem: StageConfig, hookType: TransformHook, opts: { logger?: Logger, asyncId?: string } & OptionalCacheUsage = {}): Promise<[LifecycleStep, PlayObject]> => {
        const {
            onSuccess = 'continue',
            onFailure = 'stop',
            onSkip = 'continue',
            failureReturnPartial = false,
        } = hookItem;

        const {
            logger = loggerNoop,
            asyncId = nanoid(6),
            useCachedResult
        } = opts;

        const {
            lifecycle = []
        } = playTruth;

        //const stepName = `${hookType} - ${hookItem.type} - ${hookItem.name}`
        const existingStepIndex = lifecycle.findIndex(x => x.hook === hookType && hookItem.name === x.stageName && x.stageType === hookItem.type && x.source === this.getIdentifier());
        const step: LifecycleStep = existingStepIndex !== -1 && lifecycle[existingStepIndex] !== undefined ? lifecycle[existingStepIndex] : {
            stageName: hookItem.name,
            hook: hookType,
            stageType: hookItem.type,
            source: this.getIdentifier(),
            createdAt: dayjs().toString()
        }

        let newTransformedPlay: PlayObject,
            stageName: string = 'Unnamed',
            err: Error;
        try {
            [newTransformedPlay, stageName] = await this.transformManager.handleStage(hookItem, playTruth, {asyncId, useCachedResult});
            newTransformedPlay = clone(newTransformedPlay);
        } catch (e) {
            err = e;
            if (e instanceof StageTransformError) {
                stageName = e.stageName;
            }
        }

        step.stageName = stageName;

        if (err !== undefined) {
            const lifecycleErrorContext = findCauseByFunc(err, (e) => 'lifecycleInputs' in e && e.lifecycleInputs !== undefined);
            if (lifecycleErrorContext !== undefined) {
                // @ts-expect-error it does exist
                step.inputs = clone(lifecycleErrorContext.lifecycleInputs) as LifecycleInput[];
                // @ts-expect-error it does exist
                delete lifecycleErrorContext.lifecycleInputs;
            }
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
                return [step, playTruth];
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

        return [step, newTransformedPlay ?? playTruth];
    }

    public abstract getRunningState(): ComponentState

    public getApiData(): Omit<ComponentCommonApiJson, 'type' | 'countLive' | 'players' | 'deadLetterPlays' | 'deadLetterPlaysTotal' | 'queued'> & Pick<ComponentCommonApi, 'state' | 'errors' | 'warnings'>  {
        let state: ComponentState;
        if(!this.initializedOnce || this.initializing) {
            state = COMPONENT_STATE.INITIALIZING;
        } else if(!this.isReady()) {
            state = COMPONENT_STATE.NOT_READY;
        } else {
            state = this.getRunningState()
        }
        return {
            id: this.dbComponent.id,
            uid: this.dbComponent.uid,
            name: this.dbComponent.name,
            state,
            mode: this.dbComponent.mode,
            monitoringStatus: this.getMonitoringStatus(),
            countNonLive: this.dbComponent.countNonLive,
            createdAt: this.dbComponent.createdAt?.toISOString(),
            lastReadyAt: this.lastActiveAt !== undefined ? this.lastReadyAt.toISOString() : undefined,
            lastActiveAt: this.lastActiveAt !== undefined ? this.lastActiveAt?.toISOString() : undefined,
            errors: this.errors.map(x => x instanceof Error ? serializeError(x) : x),
            warnings: this.warnings.map(x => x instanceof Error ? serializeError(x) : x),
            ...this.additionalApiData()
        }
    }

    public emitEvent = (eventName: string, payload: Record<string, any> = {}) => {
        this.emitter.emit(eventName, {
            type: this.type,
            name: this.name,
            componentId: this.dbComponent?.id,
            from: this.componentType,
            data: payload,
        });
    }

    public emitComponentUpdate = <T extends Partial<ReturnType<typeof this.getApiData>>>(payload: T) => {
        if('errors' in payload) {
            if(payload.errors.length > 0) {
                payload.errors = payload.errors.map(x => x instanceof Error ? serializeError(x) : x);
            } else {
                payload.errors = [];
            }
        }
        if('warnings' in payload) {
            if(payload.warnings.length > 0) {
               payload.warnings = payload.warnings.map(x => x instanceof Error ? serializeError(x) : x); 
            } else {
                payload.warnings = [];
            }
        }
        this.emitEvent('componentUpdate', payload);
    }
    protected emitPlayUpdate = (payload: MarkRequired<Partial<PlayApiCommonDetailed>, 'uid'>) => {
        this.emitEvent('playUpdate', payload);
    }
    protected emitPlayInsert = (payload: PlayApiCommonDetailed) => {
        this.emitEvent('playInsert', payload);
    }

    async notify(payload: Omit<WebhookPayload, 'identifier'>) {
        this.emitEvent('notify', {...payload, identifier: this.getIdentifier()});
        this.setStatus(payload.title);
    }

    public setStatus = (status: string) => {
        this.status = status;
        this.emitComponentUpdate({status});
    }

    public getSystemMonitoring = (): boolean => this.config.options?.autoMonitor ?? this.getSystemDefaultMonitoring();

    protected getSystemDefaultMonitoring = (): boolean => this.monitoringActivityDefault;

    public isMonitoring = (): boolean => this.monitoringActivity ?? this.getSystemMonitoring();

    public getMonitoringStatus = (): MonitoringStatus => ({
        monitoring: this.isMonitoring(),
        origin: this.monitoringActivity !== undefined ? MONITORING_ORIGIN_USER : MONITORING_ORIGIN_SYSTEM
    });

    protected async updateDates(data: {lastActiveAt?: Dayjs, lastReadyAt?: Dayjs, force?: boolean}) {
        const {
            lastActiveAt,
            lastReadyAt,
            force = false
        } = data;
        let updated = false;
        if(lastActiveAt !== undefined && lastActiveAt !== this.lastActiveAt) {
            this.lastActiveAt = lastActiveAt;
            updated = true;
        }
        if(lastReadyAt !== undefined && lastReadyAt !== this.lastReadyAt) {
            this.lastReadyAt = lastReadyAt;
            updated = true;
        }
        if(updated && (
            force 
            || this.lastUpdatedComponentDatesAt === undefined 
            || Math.abs(this.lastUpdatedComponentDatesAt.diff(dayjs(), 's')) >= 60
            )
        ) {
            await this.componentRepo.updateById(this.dbComponent.id, {
                lastActiveAt: this.lastActiveAt,
                lastReadyAt: this.lastReadyAt
            });
            this.lastUpdatedComponentDatesAt = dayjs();
        }
    }

    queuePlay = async (data: (PlayObject | PlayObject[]) | (PlaySelectWithQueueStates | PlaySelectWithQueueStates[]), context?: QueueContext & {isRetry?: boolean}) => {
        const createdQueuedPlays: PlaySelect[] = [];

        const dataArray = Array.isArray(data) ? data : [data];
        if (dataArray.every(x => entityIsPlayEntity(x))) {
            /**
             * If the incoming objects are already all play entities (from db)
             * then it is being requeued by the user or re-run by dead letter functionality
             * and it has already passed checkExisting so just queue it up
             */
            for (const playSelect of dataArray) {
                let queue = playSelect.queueStates.find(x => x.queueName === INGRESS_QUEUE);
                if (queue === undefined) {
                    queue = await this.queueRepo.create({ componentId: this.dbComponent.id, playId: playSelect.id, queueName: INGRESS_QUEUE, context }) as QueueStateSelect;
                } else {
                    this.queueRepo.updateById(queue.id, { queueStatus: 'queued', context, error: undefined });
                }
                const events = await this.playEventsRepo.createMany([
                    { playId: playSelect.id, ...stateChangeToPlayEvent({ state: 'queued' }) },
                    { playId: playSelect.id, ...queueStateToPlayEvent({ ...queue, queueStatus: 'queued', error: undefined, context: context ?? queue.context }) }
                ]) as PlayEventSelect[];
                playSelect.state = 'queued';
                await this.playRepo.updateById(playSelect.id, {state: 'queued'});
                if (`events` in playSelect) {
                    (playSelect as PlayWith<'events'>).events = (playSelect as PlayWith<'events'>).events.concat(events);
                } else {
                    (playSelect as unknown as PlayWith<'events'>).events = events;
                }
                this.emitPlayUpdate({ ...playSelect } as unknown as PlayApiCommonDetailed);
                this.emitEvent(queue.retries > 0 ? 'deadQueued' : 'playQueued', {queuedPlay: playSelect});
                createdQueuedPlays.push(playSelect);
            }
        } else if (dataArray.every(x => isPlayObject(x))) {
            /**
             * If all incoming objects are only PlayObjects they are new to the component:
             * for source => found from polling or through ingress request
             * for client => passed by Source discovery mechanism or play migration (future functionality)
             * 
             * so we need to do first-pass of dupe checking to identify obvious copies and reduce noise in the queue
             */

            // instead of dropping plays that were queued when monitoring was disabled
            // we add this state signal to the play meta data and queue it
            // this way we persist the play and dupe it in queue processing so the user has an audit trail
            const monitoring = this.getMonitoringStatus();
            const playDatas = dataArray.map(x => ({ ...x, meta: { ...x.meta, wasMonitored: monitoring.monitoring, seenAt: dayjs() } }));

            await pMap(playDatas, async (queueablePlay) => {
                try {
                    const existing = await this.findPreQueueExistingPlay(queueablePlay, context);
                    if(existing !== undefined) {
                        return;
                    }
                } catch (e) {
                    // if something went wrong we don't want to lose the input so fallback to persisting regardless of outcome
                    this.logger.warn(new SimpleError('Failed to check queued scrobble for existing before adding, will continue with adding anyway', { cause: e }));
                }

                // not in queue, doesn't exist elsewhere, or existing queued check failed for some reason and we don't want to lose Play
                const {
                    data,
                    meta,
                    original
                } = queueablePlay
                const createPlayData = playToRepositoryCreatePlayOpts({
                    play: {
                        data,
                        meta,
                        // only exists on plays from Source
                        original
                    },
                    componentId: this.dbComponent.id,
                    state: 'queued',
                    // only exists on plays from Source
                    parentId: queueablePlay.id
                });

                const playRow = await this.playRepo.createPlays([createPlayData]);
                const queueState = await this.queueRepo.create({ componentId: this.dbComponent.id, playId: playRow[0].id, queueName: INGRESS_QUEUE, context }) as QueueStateSelect;
                const createdEvents = await this.playEventsRepo.createMany([
                    { playId: playRow[0].id, ...stateChangeToPlayEvent({ state: 'queued' }), createdAt: playRow[0].seenAt.add(1, 'ms') },
                    { playId: playRow[0].id, ...queueStateToPlayEvent(queueState), createdAt: queueState.createdAt }
                ]);
                createdQueuedPlays.push(playRow[0]);
                this.logger.debug(`Added ${buildTrackString(queueablePlay)} to the queue`);
                if(this.componentType === COMPONENT_TYPE_CLIENT) {
                    this.setStatus(`Added Play from parent ${queueablePlay.uid} to queue`);
                }
                // TODO fully remove legacy event
                //this.emitEvent('playQueued', {queuedPlay: queueablePlay});
                this.emitPlayInsert({ ...playRow[0], queueStates: [queueState], events: createdEvents } as unknown as PlayApiCommonDetailed);
                this.queuedLength += 1;
                this.queuedGauge.labels(this.getPrometheusLabels()).inc();
            });
        } else {
            throw new Error('Data passed to queuePlay must be either all be PlayObject or all PlaySelect objects');
        }
        return createdQueuedPlays;
    }

    abstract findPreQueueExistingPlay(queueablePlay: PlayObject, context?: QueueContext & {isRetry?: boolean}): Promise<PlayWith<'parent' | 'queueStates'>>
}
