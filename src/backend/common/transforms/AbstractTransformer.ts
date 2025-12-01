import { childLogger, Logger } from "@foxxmd/logging";
import { PlayObject, TransformerCommon, TransformerCommonConfig } from "../../../core/Atomic.js";
import { getRoot } from "../../ioc.js";
import { isStageTyped, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import AbstractInitializable from "../AbstractInitializable.js";
import { StageConfig } from "../infrastructure/Transform.js";
import { cacheFunctions,  parseToRegexOrLiteralSearch, testMaybeRegex, searchAndReplace} from "@foxxmd/regex-buddy-core";
import { Cacheable } from "cacheable";
import { hashObject } from "../../utils/StringUtils.js";
import { playContentInvariantTransform } from "../../utils/PlayComparisonUtils.js";

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

export default abstract class AbstractTransformer<T = any, Y extends StageConfig = StageConfig> extends AbstractInitializable {

    declare config: TransformerCommonConfig;
    configHash: string;

    transformType: string

    regex: RegexObject
    cache: Cacheable;

    public constructor(config: TransformerCommon, options: TransformerOptions) {
        super(config);
        this.logger = childLogger(options.logger, ['Transformer', this.config.type, this.config.name]);
        this.transformType = config.type;
        this.regex = options.regexCache ?? { searchAndReplace, testMaybeRegex, parseToRegexOrLiteralSearch };
        this.cache = options.cache;
        this.configHash = hashObject(this.config);        
    }

    public parseConfig(data: any): Y {
        if (!isStageTyped(data)) {
            throw new Error(`Must be an object with a 'type' property.`);
        }
        return this.doParseConfig(data);
    }

    protected abstract doParseConfig(data: StageConfig): Y;

    public async handle(data: Y, play: PlayObject): Promise<PlayObject> {

        const cacheKey = `${this.configHash}-${hashObject(data)}-${hashObject(playContentInvariantTransform(play))}`
        const cachedTransform = await this.cache.get<PlayObject>(cacheKey);
        if(cachedTransform !== undefined) {
            this.logger.debug('Cache hit');
            return cachedTransform;
        }

        if (data.when !== undefined) {
            if (!testWhenConditions(data.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                this.logger.debug('When condition not met, returning original Play');
                await this.cache.set(cacheKey, play, '15s');
                return play;
            }
        }

        let transformData: T;
        try {
            transformData = await this.getTransformerData(play, data);
        } catch (e) {
            throw new Error(`Could not fetch transformer data`, { cause: e });
        }

        try {
            await this.checkShouldTransform(play, transformData, data);
        } catch (e) {
            this.logger.debug(new Error('checkShouldTransform did not pass, returning original Play', { cause: e }));
            return play;
        }

        const transformed = await this.doHandle(data, play, transformData);
        await this.cache.set(cacheKey, transformed, '15s');
        return transformed;
    }

    protected abstract doHandle(data: StageConfig, play: PlayObject, transformData: T): Promise<PlayObject>;

    public async getTransformerData(play: PlayObject, stageConfig: Y): Promise<T> {
        return undefined;
    }

    public async checkShouldTransform(play: PlayObject, transformData: T, stageConfig: Y): Promise<void> {
        return;
    }
}