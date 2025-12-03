import { childLogger, Logger } from "@foxxmd/logging";
import { PlayObject, TransformerCommon, TransformerCommonConfig } from "../../../core/Atomic.js";
import { isStageTyped, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import AbstractInitializable from "../AbstractInitializable.js";
import { StageConfig } from "../infrastructure/Transform.js";
import { cacheFunctions,  parseToRegexOrLiteralSearch, testMaybeRegex, searchAndReplace} from "@foxxmd/regex-buddy-core";
import { Cacheable } from "cacheable";
import { hashObject } from "../../utils/StringUtils.js";
import { playContentInvariantTransform } from "../../utils/PlayComparisonUtils.js";
import { isSimpleError } from "../errors/MSErrors.js";
import { capitalize } from "../../../core/StringUtils.js";

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

    name: string;

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

    public async handle(data: Y, play: PlayObject): Promise<PlayObject> {
        const cacheKey = `${this.configHash}-${hashObject(data)}-${hashObject(playContentInvariantTransform(play))}`
        try {
            const cachedTransform = await this.cache.get<PlayObject>(cacheKey);
            if(cachedTransform !== undefined) {
                this.logger.debug('Transform cache hit');
                return cachedTransform;
            }
        } catch (e) {
            this.logger.warn(new Error(`Could not fetch cache key ${cacheKey}`, {cause: e}));
        }

        if (data.when !== undefined) {
            if (!testWhenConditions(data.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                this.logger.debug('Returning original Play because because when condition not met');
                await this.cache.set(cacheKey, play, '15s');
                return play;
            }
        }

        try {
            await this.handlePreFetch(play, data);
        } catch (e) {
            if(isSimpleError(e) && e.simple) {
                this.logger.debug(`Returning original Play because preFetch did not pass: ${e.message}`);
            } else {
                this.logger.debug(new Error('Returning original Play because preFetch check did not pass', { cause: e }));
            }
            return play;
        }

        let transformData: T;
        let fetchedTransformData: any;
        try {
            fetchedTransformData = await this.getTransformerData(play, data);
        } catch (e) {
            throw new Error(`Could not fetch transformer data`, { cause: e });
        }

        try {
            transformData = await this.handlePostFetch(play, fetchedTransformData, data);
        } catch (e) {
            if(isSimpleError(e) && e.simple) {
                this.logger.debug(`Returning original Play because postFetch did not pass: ${e.message}`);
            } else {
                this.logger.debug(new Error('Returning original Play because postFetch did not pass', { cause: e }));
            }
            return play;
        }

        const transformed = await this.doHandle(data, play, transformData);
        await this.cache.set(cacheKey, transformed, '15s');
        return transformed;
    }

    protected abstract doHandle(data: StageConfig, play: PlayObject, transformData: T): Promise<PlayObject>;

    public async getTransformerData(play: PlayObject, stageConfig: Y): Promise<any> {
        return undefined;
    }

    public async handlePostFetch(play: PlayObject, transformData: any, stageConfig: Y): Promise<T> {
        return transformData;
    }

    public async handlePreFetch(play: PlayObject, stageConfig: Y): Promise<void> {
        return
    }
}