import { childLogger, type Logger } from "@foxxmd/logging";
import type { OptionalCacheUsage, PlayObject, TransformerCommon, TransformerCommonConfig } from "../../../core/Atomic.ts";
import { isStageTyped, testWhenConditions } from "../../utils/PlayTransformUtils.ts";
import AbstractInitializable from "../AbstractInitializable.ts";
import type { StageConfig } from "../../../core/Transform.ts";
import type { cacheFunctions} from "@foxxmd/regex-buddy-core";
import {  parseToRegexOrLiteralSearch, testMaybeRegex, searchAndReplace} from "@foxxmd/regex-buddy-core";
import type { Cacheable } from "cacheable";
import { hashObject } from "../../utils/StringUtils.ts";
import { playContentCacheHash } from "../../utils/PlayComparisonUtils.ts";
import { SkipTransformStageError, StagePrerequisiteError } from "../errors/MSErrors.ts";
import { capitalize } from "../../../core/StringUtils.ts";
import type { StaggerOptions } from "../../utils/AsyncUtils.ts";

export interface TransformerOptions {
        logger: Logger
        regexCache?: ReturnType<typeof cacheFunctions>
        cache: Cacheable
}

export interface RegexObject {
    parseToRegexOrLiteralSearch: typeof parseToRegexOrLiteralSearch
    testMaybeRegex: typeof testMaybeRegex,
    searchAndReplace: typeof searchAndReplace
}

/** Cached in place of transform data when a stage was skipped, or could not run, for a play */
interface CachedStageOutcome {
    stageOutcome: 'skip' | 'prereq'
    message: string
}

const isCachedStageOutcome = (val: unknown): val is CachedStageOutcome => val !== null && typeof val === 'object' && 'stageOutcome' in val;

export default abstract class AbstractTransformer<T = any, Y extends StageConfig = StageConfig> extends AbstractInitializable {

    declare config: TransformerCommonConfig;
    configHash: string;

    transformType: string

    regex: RegexObject
    cache: Cacheable;

    name: string;

    public staggerOpts: Partial<StaggerOptions> = { initialInterval: 0, maxRandomStagger: 0};

    public constructor(config: TransformerCommon, options: TransformerOptions) {
        super(config);
        this.name = config.name;
        this.transformType = config.type;
        this.regex = options.regexCache ?? { searchAndReplace, testMaybeRegex, parseToRegexOrLiteralSearch };
        this.cache = options.cache;
        this.configHash = hashObject(this.config);
        this.logger = childLogger(options.logger, [this.getIdentifier()]);
    }

    protected getIdentifier() {
        return `${capitalize(this.transformType)} - ${this.name}`
    }

    public parseConfig(data: any): Y {
        if (!isStageTyped(data)) {
            throw new Error(`Must be an object with a 'type' property.`);
        }
        return this.doParseConfig(data);
    }

    protected abstract doParseConfig(data: StageConfig): Y;

    public async handle(data: Y, play: PlayObject, opts?: OptionalCacheUsage): Promise<PlayObject> {
        const {
            useCachedResult = true,
        } = (opts ?? {});
        const cacheKey = `transformResult-${this.configHash}-${hashObject(data)}-${playContentCacheHash(play)}`
        let cachedOutcome: CachedStageOutcome | undefined;
        try {
            const cachedTransformData = useCachedResult ? await this.cache.get<T | CachedStageOutcome>(cacheKey) : undefined;
            if(isCachedStageOutcome(cachedTransformData)) {
                cachedOutcome = cachedTransformData;
            } else if(cachedTransformData !== undefined) {
                this.logger.debug('Transform cache hit');
                const transformed = await this.doHandle(data, play, cachedTransformData, opts);
                return transformed;
            }
        } catch (e) {
            this.logger.warn(new Error(`Could not fetch cache key ${cacheKey}`, {cause: e}));
        }

        if(cachedOutcome !== undefined) {
            // stage did not produce data for this play last time, repeat that outcome instead of doing the work again
            this.logger.debug('Transform cache hit');
            if(cachedOutcome.stageOutcome === 'skip') {
                throw new SkipTransformStageError(cachedOutcome.message, {shortStack: true});
            }
            throw new Error('postFetch did not pass', { cause: new StagePrerequisiteError(cachedOutcome.message, {shortStack: true}) });
        }

        if (data.when !== undefined) {
            if (!testWhenConditions(data.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                await this.cacheOutcome(cacheKey, 'skip', 'When condition not met');
                throw new SkipTransformStageError('When condition not met', {shortStack: true});
            }
        }

        try {
            await this.handlePreFetch(play, data, opts);
        } catch (e) {
            if(e instanceof SkipTransformStageError) {
                await this.cacheOutcome(cacheKey, 'skip', e.message);
            }
            throw new Error('preFetch check did not pass', { cause: e });
        }

        let transformData: T;
        let fetchedTransformData: any;
        try {
            fetchedTransformData = await this.getTransformerData(play, data, opts);
        } catch (e) {
            throw new Error(`Could not fetch transformer data`, { cause: e });
        }

        try {
            transformData = await this.handlePostFetch(play, fetchedTransformData, data, opts);
        } catch (e) {
            if(e instanceof StagePrerequisiteError) {
                await this.cacheOutcome(cacheKey, 'prereq', e.message);
            }
            throw new Error('postFetch did not pass', { cause: e });
        }

        const transformed = await this.doHandle(data, play, transformData, opts);
        await this.cache.set(cacheKey, transformData, this.config.options?.ttl ?? '15s');
        return transformed;
    }

    protected async cacheOutcome(cacheKey: string, stageOutcome: CachedStageOutcome['stageOutcome'], message: string): Promise<void> {
        const outcome: CachedStageOutcome = { stageOutcome, message };
        await this.cache.set(cacheKey, outcome, this.config.options?.ttl ?? '15s');
    }

    protected abstract doHandle(data: StageConfig, play: PlayObject, transformData: T, opts?: OptionalCacheUsage): Promise<PlayObject>;

    public async getTransformerData(play: PlayObject, stageConfig: Y, opts?: OptionalCacheUsage): Promise<any> {
        return undefined;
    }

    public async handlePostFetch(play: PlayObject, transformData: any, stageConfig: Y, opts?: OptionalCacheUsage): Promise<T> {
        return transformData;
    }

    public async handlePreFetch(play: PlayObject, stageConfig: Y, opts?: OptionalCacheUsage): Promise<void> {
        return
    }
}