import { childLogger, type Logger } from "@foxxmd/logging";
import type AbstractTransformer from "./AbstractTransformer.ts";
import type {OptionalCacheUsage, TransformerCommonConfig} from "../../../core/Atomic.ts";
import type {StageConfig} from "../../../core/Transform.ts";
import type {PlayObject} from "../../../core/Atomic.ts";
import { isStageTyped } from "../../utils/PlayTransformUtils.ts";
import type { MSCache } from "../Cache.ts";
import { configFromEnv, type MusicbrainzTransformerConfig } from "./musicbrainz/MusicbrainzTransformerUtil.ts";
import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from "nanoid";
import { SimpleError, StageTransformError } from "../errors/MSErrors.ts";
import { configFromEnv as rsConfigFromEnv } from "./rocksky/RockskyTransformerUtil.ts";
import { type RockskyTransformerConfig } from "../vendor/rocksky/interfaces.ts";

export const DEFAULT_TRANSFORMER_NAME = 'MSDefault';
export default class TransformerManager {

    protected logger: Logger;
    protected parentLogger: Logger;
    protected transformers: Map<string, AbstractTransformer[]> = new Map();
    protected cache: MSCache;
    protected asyncStore: AsyncLocalStorage<string>;

    protected transformerConfigs: TransformerCommonConfig[] = [];

    public constructor(logger: Logger, cache: MSCache) {
        this.logger = childLogger(logger, 'Transformer Manager');
        this.parentLogger = logger;
        this.cache = cache;
        this.asyncStore = new AsyncLocalStorage();
        this.addTransformerConfig({type: 'user', name: DEFAULT_TRANSFORMER_NAME});
        this.addTransformerConfig({type: 'native', name: DEFAULT_TRANSFORMER_NAME});
        this.addTransformerConfig({type: 'rocksky', name: DEFAULT_TRANSFORMER_NAME});
    }

    public addTransformerConfig(config: TransformerCommonConfig): void {
        if(this.transformerConfigs.some(x => x.name === config.name && x.type === config.type)) {
            throw new Error(`Cannot add two configs of the same type (${config.type}) with the same name '${config.name}'`);
        }
        this.transformerConfigs.push(config);
    }

    public hasTransformerConfigByIdentifiers(type: string, name: string = DEFAULT_TRANSFORMER_NAME) {
        return this.transformerConfigs.some(x => x.type === type && x.name === name);
    }

    public hasTransformerConfigByType(type: string) {
        return this.transformerConfigs.some(x => x.type === type);
    }

    public async registerByIdentifiers(type: string, name: string = DEFAULT_TRANSFORMER_NAME) {
        const transformers = this.transformers.get(type);
        if(transformers !== undefined && transformers.some(x => x.name !== name)) {
            this.logger.debug(`Transformer type ${type} with name ${name} already registered`);
            return;
        }
        const config = this.transformerConfigs.find(x => x.name === name && x.type === type);
        if(config === undefined) {
            throw new Error(`No existing configuration for transformer of type ${type} with name ${name} exists`);
        }
        await this.register(config);
    }

    public async register(config: TransformerCommonConfig): Promise<void> {
        let transformers: AbstractTransformer[] = [];
        if (!this.transformers.has(config.type)) {
            this.transformers.set(config.type, []);
        } else {
            transformers = this.transformers.get(config.type);
        }

        if (config.name !== undefined && transformers.some(x => x.config.name === config.name)) {
            throw new Error(`Cannot register ${config.type} transformer with name '${config.name}' because an existing transformer already has that name`);
        }
        const tName = config.name ?? `unnamed-${transformers.length + 1}`;

        this.logger.verbose(`Registering ${config.type} transformer with name '${tName}'`);

        const tLogger = childLogger(this.parentLogger, ['Transformer', () => this.asyncStore.getStore() ?? undefined]);

        let t: AbstractTransformer;
        switch (config.type) {
            case 'user': {
                const UserTransformer = (await import("./UserTransformer.ts")).default;
                t = new UserTransformer({ name: tName, ...config }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }    break;
            case 'native': {
                const NativeTransformer = (await import("./NativeTransformer.ts")).default;
                t = new NativeTransformer({ name: tName,  ...config }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'musicbrainz': {
                const MusicbrainzTransformer = (await import("./MusicbrainzTransformer.ts")).default;
                t = new MusicbrainzTransformer({ name: tName, ...config as MusicbrainzTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'rocksky': {
                const RockskyTransformer = (await import("./rocksky/RockskyTransformer.ts")).default;
                t = new RockskyTransformer({ name: tName, ...config as RockskyTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            default:
                throw new Error(`No transformer of type '${config.type}' exists.`);
        }
        this.transformers.set(config.type, [...transformers, t]);
        this.logger.verbose(`${config.type} transformer with name '${tName}' registered`);
    }

    public async registerFromEnv() {
        try {
            const mbConfig = configFromEnv(this.logger);
            if(mbConfig !== undefined) {
                this.addTransformerConfig(mbConfig);
            } else {
                this.logger.debug('No Musicbrainz transformer to build from ENV');
            }
        } catch (e) {
            if(e instanceof SimpleError) {
                this.logger.error(`Unable to build Musicbrainz Transformer from ENV: ${e.message}`);
            }
            this.logger.error(new Error('Unable to build Musicbrainz Transformer from ENV', {cause: e}));
        }
        try {
            const rsConfig = rsConfigFromEnv(this.logger);
            if(rsConfig !== undefined) {
                this.addTransformerConfig(rsConfig);
            } else {
                this.logger.debug('No Rocksky transformer to build from ENV');
            }
        } catch (e) {
            if(e instanceof SimpleError) {
                this.logger.error(`Unable to build Rocksky Transformer from ENV: ${e.message}`);
            }
            this.logger.error(new Error('Unable to build Rocksky Transformer from ENV', {cause: e}));
        }
    }

    public async initTransformers() {
        this.logger.verbose('Initializing transformers...');
        for (const list of this.transformers.values()) {
            for (const transformer of list) {
                if (!transformer.isReady()) {
                    if (!transformer.canAuthUnattended()) {
                        transformer.logger.warn({ label: 'Heartbeat' }, 'Transformer is not ready but will not try to initialize because auth state is not good and cannot be correct unattended.');
                    }
                    try {
                        await transformer.initialize({ force: false, notify: true, notifyTitle: 'Could not initialize automatically' });
                    } catch (e) {
                        transformer.logger.error(new Error('Could not initialize source automatically', { cause: e }));
                    }
                }
            }
        }
        this.logger.verbose('Done initializing transformers');
    }

    public hasTransformerType(type: string): boolean {
        return this.transformers.has(type);
    }

    public getTransformerType(type: string): AbstractTransformer[] | undefined {
        return this.transformers.get(type);
    }

    public async getTransformerByStage(data: StageConfig): Promise<AbstractTransformer> {
        let list = this.transformers.get(data.type);
        if (list === undefined || list.length === 0) {
            if(!this.hasTransformerConfigByType(data.type)) {
                throw new Error(`No transformer configurations of type '${data.type}' exist.`);
            }
            if(data.name !== undefined) {
                // if name for transform was specific then try to init and use that specific one
                if(this.hasTransformerConfigByIdentifiers(data.type, data.name)) {
                    await this.registerByIdentifiers(data.type, data.name);
                    await this.initTransformers();
                    list = this.transformers.get(data.type)
                } else {
                    throw new Error(`No transformer configuration of type '${data.type}' with name '${data.name}' exists.`);
                }
            } else {
                // otherwise we try to get *any* transform of this type, starting with non-default
                let configToUse: TransformerCommonConfig;
                const nonDefault = this.transformerConfigs.find(x => x.type === data.type && x.name !== DEFAULT_TRANSFORMER_NAME);
                if(nonDefault !== undefined) {
                    // use first non-default, if there is one
                    configToUse = nonDefault;
                } else {
                    // otherwise use first found
                    configToUse = this.transformerConfigs.find(x => x.type === data.type);
                }
                await this.registerByIdentifiers(configToUse.type, configToUse.name);
                await this.initTransformers();
                list = this.transformers.get(data.type)
            }
        }

        if(data.name === undefined) {
            if(list.length > 1) {
                this.logger.warn(`More than one '${data.type}' transformer is registered but name was not specified, using first found`);
                return list[0];
            }
            return list[0]            
        }

        let namedTransformers = list.find(x => x.name.toLocaleLowerCase().trim() === data.name.toLocaleLowerCase().trim());
        if(namedTransformers === undefined) {
            if(this.hasTransformerConfigByIdentifiers(data.type, data.name)) {
                await this.registerByIdentifiers(data.type, data.name);
                await this.initTransformers();
                list = this.transformers.get(data.type);
                namedTransformers = list.find(x => x.name.toLocaleLowerCase().trim() === data.name.toLocaleLowerCase().trim());
                if(namedTransformers === undefined) {
                    // this shouldn't really happen but just covering bases
                    throw new SimpleError(`Component wanted transformer type ${data.type} with name ${data.name}. Transforms of this type are registered but none have this name.`);
                }
                return namedTransformers;
            }
            throw new SimpleError(`Component wanted transformer type ${data.type} with name ${data.name}. Transforms of this type are registered but none have this name.`);
        }
        return namedTransformers;
    }

    public async parseTransformerConfig(data: any) {
        if (!isStageTyped(data)) {
            throw new Error(`Must be an object with a 'type' property.`);
        }
        const t = await this.getTransformerByStage(data);
        const config = t.parseConfig(data);
        config.stageHash = t.configHash;
        return config;
    }

    public async handleStage(data: StageConfig, play: PlayObject, opts: {asyncId?: string} & OptionalCacheUsage): Promise<[PlayObject, string]> {
        const t: AbstractTransformer = await this.getTransformerByStage(data);
        try {
            const transformedPlay = await this.asyncStore.run(opts.asyncId ?? nanoid(6), async () => {
                return await t.handle(data, play);
            });
            return [transformedPlay, t.name];
        } catch (e) {
            throw new StageTransformError(t.name, 'Stage processing stopped early', {cause: e});
        }
    }
}