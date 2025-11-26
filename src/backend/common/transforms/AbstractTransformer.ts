import { childLogger, Logger } from "@foxxmd/logging";
import { PlayObject, TransformerCommon, TransformerCommonConfig } from "../../../core/Atomic.js";
import { getRoot } from "../../ioc.js";
import { isStageTyped, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import AbstractInitializable from "../AbstractInitializable.js";
import { StageConfig } from "../infrastructure/Transform.js";
import { cacheFunctions } from "@foxxmd/regex-buddy-core";

export interface TransformerOptions {
        logger: Logger
        regexCache: ReturnType<typeof cacheFunctions>
}

export default abstract class AbstractTransformer<T = any> extends AbstractInitializable {

    declare config: TransformerCommonConfig;

    transformType: string

    regexCache: ReturnType<typeof cacheFunctions>

    public constructor(config: TransformerCommon, options: TransformerOptions) {
        super(config);
        this.logger = childLogger(options.logger, ['Transformer', this.config.type, this.config.name]);
        this.transformType = config.type;
        this.regexCache = options.regexCache;
    }

    public parseConfig(data: any) {
        if (!isStageTyped(data)) {
            throw new Error(`Must be an object with a 'type' property.`);
        }
        return this.doParseConfig(data);
    }

    protected abstract doParseConfig(data: StageConfig): StageConfig;

    public async handle(data: StageConfig, play: PlayObject): Promise<PlayObject> {

        if (data.when !== undefined) {
            if (!testWhenConditions(data.when, play, { testMaybeRegex: this.regexCache.testMaybeRegex })) {
                this.logger.debug('When condition not met, returning original Play');
                return play;
            }
        }

        const {
            failOnFetch = false,
            throwOnFailure = false,
        } = this.config.options || {};

        let transformData: T;
        try {
            transformData = await this.getTransformerData(play);
        } catch (e) {
            if (failOnFetch) {
                throw new Error(`Could not fetch transformer data`, { cause: e });
            }
            this.logger.warn(new Error(`Could not fetch transformer data, returning original Play`, { cause: e }));
            return play;
        }

        try {
            await this.checkShouldTransform(play, transformData);
        } catch (e) {
            this.logger.debug(new Error('checkShouldTransform did not pass, returning original Play', { cause: e }));
            return play;
        }

        return await this.doHandle(data, play, transformData);
    }

    protected abstract doHandle(data: StageConfig, play: PlayObject, transformData: T): Promise<PlayObject>;

    public async getTransformerData(play: PlayObject): Promise<T> {
        return undefined;
    }

    public async checkShouldTransform(play: PlayObject, transformData: T): Promise<void> {
        return;
    }
}