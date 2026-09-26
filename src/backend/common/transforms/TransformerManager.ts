import { childLogger, type Logger } from "@foxxmd/logging";
import type AbstractTransformer from "./AbstractTransformer.ts";
import type {OptionalCacheUsage, TransformerCommonConfig} from "../../../core/Atomic.ts";
import {DEFAULT_TRANSFORMER_ENV_NAME, DEFAULT_TRANSFORMER_NAME, type StageConfig} from "../../../core/Transform.ts";
import type {PlayObject} from "../../../core/Atomic.ts";
import { isStageTyped } from "../../utils/PlayTransformUtils.ts";
import type { MSCache } from "../Cache.ts";
import { configFromEnv, type MusicbrainzTransformerConfig } from "./musicbrainz/MusicbrainzTransformerUtil.ts";
import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from "nanoid";
import { SimpleError, StageTransformError } from "../errors/MSErrors.ts";
import { configFromEnv as rsConfigFromEnv } from "./rocksky/RockskyTransformerUtil.ts";
import { configFromEnv as caaConfigFromEnv } from "./coverartarchive/CoverArtArchiveTransformerUtil.ts";
import { type RockskyTransformerConfig } from "../vendor/rocksky/interfaces.ts";
import { configFromEnv as spotifyConfigFromEnv, type SpotifyTransformerConfig } from "./spotify/SpotifyTransformerUtil.ts";
import type { CovertArtArchiveTransformerConfig } from "./coverartarchive/CoverArtArchiveTransformerUtil.ts";
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
        this.addTransformerConfig({type: 'coverartarchive', name: DEFAULT_TRANSFORMER_NAME});
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
        this.logger.debug(`Registering transform type ${type} with name ${name}`);
        await this.register(config);
    }

    public async register(config: TransformerCommonConfig): Promise<void> {
        let transformers = this.transformers.get(config.type);
        if (transformers === undefined) {
            transformers = [];
            this.transformers.set(config.type, transformers);
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
                t = new MusicbrainzTransformer({ name: tName, ...config as Omit<MusicbrainzTransformerConfig, 'name'> }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'rocksky': {
                const RockskyTransformer = (await import("./rocksky/RockskyTransformer.ts")).default;
                t = new RockskyTransformer({ name: tName, ...config as Omit<RockskyTransformerConfig, 'name'> }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'spotify': {
                const SpotifyTransformer = (await import("./SpotifyTransformer.ts")).default;
                t = new SpotifyTransformer({ name: tName, ...config as Omit<SpotifyTransformerConfig, 'name'> }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            } break;
            case 'coverartarchive': {
                const CovertArtArchiveTransformer = (await import("./coverartarchive/CoverArtArchiveTransformer.ts")).default;
                t = new CovertArtArchiveTransformer({ name: tName, ...config as Omit<CovertArtArchiveTransformerConfig, 'name'> }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
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
        try {
            const spotifyConfig = spotifyConfigFromEnv(this.logger);
            if(spotifyConfig !== undefined) {
                this.addTransformerConfig(spotifyConfig);
            } else {
                this.logger.debug('No Spotify transformer to build from ENV');
            }
        } catch (e) {
            if(e instanceof SimpleError) {
                this.logger.error(`Unable to build Spotify Transformer from ENV: ${e.message}`);
            }
            this.logger.error(new Error('Unable to build Spotify Transformer from ENV', {cause: e}));
        }
        try {
            const caaConfig = caaConfigFromEnv(this.logger);
            if(caaConfig !== undefined) {
                this.addTransformerConfig(caaConfig);
            } else {
                this.logger.debug('No Covert Art Archive transformer to build from ENV');
            }
        } catch (e) {
            if(e instanceof SimpleError) {
                this.logger.error(`Unable to build Cover Art Archive Transformer from ENV: ${e.message}`);
            }
            this.logger.error(new Error('Unable to build Cover Art Archive Transformer from ENV', {cause: e}));
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
        const transformType: string = data.type;
        let configName: string | undefined = data.name;

        let list = this.transformers.get(transformType);
        if (list === undefined || list.length === 0) {
            if(!this.hasTransformerConfigByType(transformType)) {
                throw new Error(`No transformer configurations of type '${transformType}' exist.`);
            }
            if(configName !== undefined) {
                // if name for transform was specific then try to init and use that specific one
                if(this.hasTransformerConfigByIdentifiers(transformType, configName)) {
                    await this.registerByIdentifiers(transformType, configName);
                    await this.initTransformers();
                    list = this.transformers.get(transformType)
                } else {
                    throw new Error(`No transformer configuration of type '${transformType}' with name '${configName}' exists.`);
                }
            } else {
                // otherwise we try to get *any* transform of this type, starting with non-default, then env, then default
                let anyExistingConfig: TransformerCommonConfig | undefined = undefined;
                const configs = getTransformByPriority(this.transformerConfigs.filter(x => x.type === transformType));
                if(configs.nonDefault !== undefined) {
                    if(configs.nonDefaultMany) {
                        this.logger.warn(`No config name specified and more than one non-default exists. Using the first found non-default (${configs.nonDefault.name})`);
                    } else {
                        this.logger.verbose(`No config name specified, using the first found non-default config (${configs.nonDefault.name})`);
                    }
                    anyExistingConfig = configs.nonDefault;
                } else if(configs.env !== undefined) {
                    this.logger.verbose(`No config name specified, using found ENV config since no non-default configs exist (${configs.env.name})`);
                    anyExistingConfig = configs.env;
                } else if(configs.default !== undefined) {
                    this.logger.verbose(`No config name specified and no non-default or ENV configs exist, using default (${configs.default.name})`);
                    anyExistingConfig = configs.default;
                }

                if(anyExistingConfig === undefined) {
                    throw new Error(`No transformer configurations of type '${transformType}' exist.`);
                }
                await this.registerByIdentifiers(anyExistingConfig.type, anyExistingConfig.name);
                await this.initTransformers();
                configName = anyExistingConfig.name;
                list = this.transformers.get(transformType)
            }
        }

        if (list === undefined || list.length === 0) {
            throw new Error(`No transformers of type '${transformType}' could be registered.`);
        }

        if(configName === undefined) {
            const transformers = getTransformByPriority(list);
            if(transformers.nonDefault !== undefined) {
                return transformers.nonDefault;
            }
            if(transformers.env !== undefined) {
                return transformers.env;
            }
            if(transformers.default !== undefined) {
                return transformers.default;
            }
            // shouldn't happen at this point but covering strict ts
            throw new Error(`No transformers of type '${transformType}' could be found`);       
        }

        let namedTransformers = list.find(x => x.name.toLocaleLowerCase().trim() === configName.toLocaleLowerCase().trim());
        if(namedTransformers === undefined) {
            if(this.hasTransformerConfigByIdentifiers(data.type, data.name)) {
                await this.registerByIdentifiers(data.type, data.name);
                await this.initTransformers();
                list = this.transformers.get(data.type);
                namedTransformers = list?.find(x => x.name.toLocaleLowerCase().trim() === configName.toLocaleLowerCase().trim());
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

interface TransformPriorityObj<T extends TransformerCommonConfig | AbstractTransformer> {
    default?: T,
    env?: T,
    nonDefault?: T,
    nonDefaultMany: boolean
}
const getTransformByPriority = <T extends TransformerCommonConfig | AbstractTransformer>(configs: T[]): TransformPriorityObj<T> => configs.reduce((acc: TransformPriorityObj<T>, curr) => {
        if(curr.name === DEFAULT_TRANSFORMER_NAME) {
            return {
                ...acc,
                default: curr
            }
        }
        if(curr.name === DEFAULT_TRANSFORMER_ENV_NAME) {
            return {
                ...acc,
                env: curr
            }
        }
        if(acc.nonDefault === undefined) {
            return {
                ...acc,
                nonDefault: curr
            }
        }
        return {
            ...acc,
            nonDefaultMany: true
        }
    }, {default: undefined, env: undefined, nonDefault: undefined, nonDefaultMany: false});

// interface TransformConfigPriorityObj {
//     default?: TransformerCommonConfig,
//     env?: TransformerCommonConfig,
//     nonDefault?: TransformerCommonConfig,
//     nonDefaultMany: boolean
// }
// const getTransformConfigsByPriority = (configs: TransformerCommonConfig[]): TransformConfigPriorityObj => configs.reduce((acc: TransformConfigPriorityObj, curr) => {
//         if(curr.name === DEFAULT_TRANSFORMER_NAME) {
//             return {
//                 ...acc,
//                 default: curr
//             }
//         }
//         if(curr.name === DEFAULT_TRANSFORMER_ENV_NAME) {
//             return {
//                 ...acc,
//                 env: curr
//             }
//         }
//         if(acc.nonDefault === undefined) {
//             return {
//                 ...acc,
//                 nonDefault: curr
//             }
//         }
//         return {
//             ...acc,
//             nonDefaultMany: true
//         }
//     }, {default: undefined, env: undefined, nonDefault: undefined, nonDefaultMany: false});

// interface TransformInstancePriorityObj {
//     default?: AbstractTransformer,
//     env?: AbstractTransformer,
//     nonDefault?: AbstractTransformer,
//     nonDefaultMany: boolean
// }
// const getTransformInstanceByPriority = (configs: AbstractTransformer[]): TransformInstancePriorityObj => configs.reduce((acc: TransformInstancePriorityObj, curr) => {
//         if(curr.name === DEFAULT_TRANSFORMER_NAME) {
//             return {
//                 ...acc,
//                 default: curr
//             }
//         }
//         if(curr.name === DEFAULT_TRANSFORMER_ENV_NAME) {
//             return {
//                 ...acc,
//                 env: curr
//             }
//         }
//         if(acc.nonDefault === undefined) {
//             return {
//                 ...acc,
//                 nonDefault: curr
//             }
//         }
//         return {
//             ...acc,
//             nonDefaultMany: true
//         }
//     }, {default: undefined, env: undefined, nonDefault: undefined, nonDefaultMany: false})