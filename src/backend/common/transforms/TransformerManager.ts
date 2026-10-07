import { childLogger, type Logger } from "@foxxmd/logging";
import type AbstractTransformer from "./AbstractTransformer.ts";
import type {OptionalCacheUsage, TransformerCommon, TransformerCommonConfig} from "../../../core/Atomic.ts";
import {DEFAULT_TRANSFORMER_ENV_NAME, DEFAULT_TRANSFORMER_NAME, type MetadataProviderStageType, type StageConfig} from "../../../core/Transform.ts";
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
import { asMetadataProvider, type AggregateMetadataResponse, type MetadataProvider } from "../metadataProviders/MetadataProviderUtils.ts";
import type { AlbumSearchResult, ArtistSearchResult, TrackSearchResult } from "../../../core/Api.ts";
import {pPropsAllSettled} from 'p-props';

type TransformNamedMap = Map<string, AbstractTransformer>;
type TransformTypedMap = Map<string,TransformNamedMap>;
export default class TransformerManager {

    protected logger: Logger;
    protected parentLogger: Logger;
    protected transformers: TransformTypedMap = new Map();
    protected cache: MSCache;
    protected asyncStore: AsyncLocalStorage<string>;

    protected transformerConfigs: TransformerCommon[] = [];

    protected transformMetadataProviders: Partial<Record<MetadataProviderStageType, string>> = {};
    protected transformMetadataPreferredProviders: Partial<Record<MetadataProviderStageType, true | string>> | undefined;

    public constructor(logger: Logger, cache: MSCache) {
        this.logger = childLogger(logger, 'Transformer Manager');
        this.parentLogger = logger;
        this.cache = cache;
        this.asyncStore = new AsyncLocalStorage();
        this.addTransformerConfig({type: 'user', name: DEFAULT_TRANSFORMER_NAME});
        this.addTransformerConfig({type: 'native', name: DEFAULT_TRANSFORMER_NAME});
        this.addTransformerConfig({type: 'rocksky', name: DEFAULT_TRANSFORMER_NAME});
        this.addTransformerConfig({type: 'coverartarchive', name: DEFAULT_TRANSFORMER_NAME});
        this.addTransformerConfig({type: 'musicbrainz', name: DEFAULT_TRANSFORMER_NAME});
    }

    public addTransformerConfig(config: TransformerCommonConfig): void {
        config.type = config.type.toLocaleLowerCase().trim();
        const name = config.name ?? `unnamed-${this.transformerConfigs.filter(x => x.type === config.type).length + 1}`;
        const namedConfig: TransformerCommon = {
            ...config,
            name
        }
        if(this.transformerConfigs.some(x => x.name.toLocaleLowerCase() === namedConfig.name.toLocaleLowerCase() && x.type === config.type)) {
            throw new Error(`Cannot add two configs of the same type (${namedConfig.type}) with the same name '${namedConfig.name}'`);
        }
        this.transformerConfigs.push(namedConfig);
    }

    public hasTransformerConfigByIdentifiers(type: string, name: string = DEFAULT_TRANSFORMER_NAME) {
        return this.transformerConfigs.some(x => x.type === type.toLocaleLowerCase().trim() && x.name.toLocaleLowerCase() === name.toLocaleLowerCase().trim());
    }

    public hasTransformerConfigByType(type: string) {
        return this.transformerConfigs.some(x => x.type === type.toLocaleLowerCase().trim());
    }

    public async registerByIdentifiers(type: string, name: string = DEFAULT_TRANSFORMER_NAME) {
        const transformers = this.transformers.get(type.toLocaleLowerCase().trim());
        if(transformers !== undefined && transformers.has(name.toLocaleLowerCase().trim())) {
            this.logger.debug(`Transformer type ${type} with name ${name} already registered`);
            return;
        }
        const config = this.transformerConfigs.find(x => x.name.toLocaleLowerCase().trim() === name.toLocaleLowerCase().trim() && x.type === type.toLocaleLowerCase().trim());
        if(config === undefined) {
            throw new Error(`No existing configuration for transformer of type ${type} with name ${name} exists`);
        }
        this.logger.debug(`Registering transform type ${type} with name ${name}`);
        await this.register(config);
    }

    public async register(config: TransformerCommon): Promise<void> {
        // TODO replace with getOrInsert in node 26+
        let namedTransformerMap = this.transformers.get(config.type.toLocaleLowerCase().trim());
        if(namedTransformerMap === undefined) {
            namedTransformerMap = new Map();
            this.transformers.set(config.type.toLocaleLowerCase().trim(), namedTransformerMap);
        }

        if (namedTransformerMap.has(config.name.toLocaleLowerCase().trim())) {
            throw new Error(`Cannot register ${config.type} transformer with name '${config.name}' because an existing transformer already has that name`);
        }

        this.logger.verbose(`Registering ${config.type} transformer with name '${config.name}'`);

        const tLogger = childLogger(this.parentLogger, ['Transformer', () => this.asyncStore.getStore() ?? undefined]);

        let t: AbstractTransformer;
        switch (config.type.toLocaleLowerCase().trim()) {
            case 'user': {
                const UserTransformer = (await import("./UserTransformer.ts")).default;
                t = new UserTransformer({ ...config }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }    break;
            case 'native': {
                const NativeTransformer = (await import("./NativeTransformer.ts")).default;
                t = new NativeTransformer({ ...config }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'musicbrainz': {
                const MusicbrainzTransformer = (await import("./MusicbrainzTransformer.ts")).default;
                t = new MusicbrainzTransformer({ ...config as MusicbrainzTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'rocksky': {
                const RockskyTransformer = (await import("./rocksky/RockskyTransformer.ts")).default;
                t = new RockskyTransformer({ ...config as RockskyTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            case 'spotify': {
                const SpotifyTransformer = (await import("./SpotifyTransformer.ts")).default;
                t = new SpotifyTransformer({ ...config as SpotifyTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            } break;
            case 'coverartarchive': {
                const CovertArtArchiveTransformer = (await import("./coverartarchive/CoverArtArchiveTransformer.ts")).default;
                t = new CovertArtArchiveTransformer({ ...config as CovertArtArchiveTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
            }   break;
            default:
                throw new Error(`No transformer of type '${config.type}' exists.`);
        }

        this.transformers.get(config.type.toLocaleLowerCase().trim())!.set(config.name.toLocaleLowerCase().trim(), t);
        this.logger.verbose(`${config.type} transformer with name '${config.name}' registered`);
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
            for (const transformer of list.values()) {
                if (!transformer.isReady() && !transformer.initializing) {
                    if (!transformer.canAuthUnattended()) {
                        transformer.logger.warn({ label: 'Heartbeat' }, 'Transformer is not ready but will not try to initialize because auth state is not good and cannot be correct unattended.');
                    }
                    try {
                        await transformer.initialize({ force: false, notify: true, notifyTitle: 'Could not initialize automatically' });

                        if(asMetadataProvider(transformer)) {
                            const t = transformer.transformType as MetadataProviderStageType;
                            if(this.transformMetadataPreferredProviders !== undefined) {
                                // only use transformers user prefers and don't add any they don't explicitly set
                                if(this.transformMetadataPreferredProviders[t] !== undefined) {
                                    
                                    if(this.transformMetadataPreferredProviders[t] === transformer.name) {
                                        // use transformer if defined by name
                                        this.transformMetadataProviders[t] = transformer.name;
                                        this.logger.debug(`Using preferred named ${t} transformer '${transformer.name}' as metadata provider.`);
                                    } else if(this.transformMetadataPreferredProviders[t] === true) {
                                        // or user has set `true` to indicate any
                                        if(this.transformMetadataProviders[t] === undefined) {
                                            // use this one if none is already set
                                            this.transformMetadataProviders[t] = transformer.name;
                                            this.logger.debug(`Using preferred ${t} transformer with priorities. Not set yet so using '${transformer.name}' as metadata provider.`);
                                        } else {
                                            // otherwise set based on priority
                                            const p = getTransformByPriority([this.transformers.get(t)?.get(this.transformMetadataProviders[t]) as AbstractTransformer, transformer]);
                                            if(p.nonDefaultMany !== true) {
                                                const old = this.transformMetadataProviders[t];
                                                this.transformMetadataProviders[t] = p.nonDefault?.name ?? p.env?.name ?? p.default?.name;
                                                this.logger.debug(`Using preferred ${t} transformer with priorities, a new transformer had higher priority. Replaced '${old}' with ${this.transformMetadataProviders[t]}`);
                                            } else {
                                                this.logger.debug(`Using preferred ${t} transformer with priorities and a non-default was already set, skipping '${transformer.name}' as metadata provider.`);
                                            }
                                            // if both are non default then use the one that was already set
                                        }
                                    }
                                    // otherwise do not add
                                } else {
                                    this.logger.debug(`Preferred named metadata providers are defined but type ${t} is not set, skipping adding ${transformer.name}`);
                                }
                                // not explicitly set, don't add any
                            } else {
                                // otherwise set all that can be used and set based on priority
                                // when more than one is available
                                if(this.transformMetadataProviders[t] === undefined) {
                                    this.logger.debug(`No preferred metadata providers and none already set for ${t}, using '${transformer.name}' as metadata provider.`);
                                    this.transformMetadataProviders[t] = transformer.name;
                                } else {
                                    const p = getTransformByPriority([this.transformers.get(t)?.get(this.transformMetadataProviders[t]) as AbstractTransformer, transformer]);
                                    if(p.nonDefaultMany !== true) {
                                        const old = this.transformMetadataProviders[t];
                                        this.transformMetadataProviders[t] = p.nonDefault?.name ?? p.env?.name ?? p.default?.name;
                                        this.logger.debug(`No preferred metadata providers, a new transformer for ${t} had higher priority. Replaced ${old} with ${this.transformMetadataProviders[t]}`);
                                    }
                                }
                            }
                        }
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

    public getTransformerType(type: string): TransformNamedMap | undefined {
        return this.transformers.get(type);
    }

    public async getTransformerByStage(data: StageConfig): Promise<AbstractTransformer> {
        const transformType: string = data.type.toLocaleLowerCase().trim();
        let configName: string | undefined = data.name;

        let namedMap = this.transformers.get(transformType);
        if (namedMap === undefined || namedMap.size === 0) {
            if(!this.hasTransformerConfigByType(transformType)) {
                throw new Error(`No transformer configurations of type '${transformType}' exist.`);
            }
            if(configName !== undefined) {
                // if name for transform was specific then try to init and use that specific one
                if(this.hasTransformerConfigByIdentifiers(transformType, configName)) {
                    await this.registerByIdentifiers(transformType, configName);

                    await this.initTransformers();
                    namedMap = this.transformers.get(transformType)
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
                namedMap = this.transformers.get(transformType)
            }
        }

        if (namedMap === undefined || namedMap.size === 0) {
            throw new Error(`No transformers of type '${transformType}' could be registered.`);
        }

        if(configName === undefined) {
            const transformers = getTransformByPriority(namedMap.values().toArray());
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

        let namedTransformer = namedMap.get(configName.toLocaleLowerCase().trim());
        if(namedTransformer === undefined) {
            if(this.hasTransformerConfigByIdentifiers(data.type, data.name)) {
                await this.registerByIdentifiers(data.type, data.name);
                await this.initTransformers();
                namedTransformer = this.transformers.get(data.type)?.get(configName.toLocaleLowerCase().trim());
                if(namedTransformer === undefined) {
                    // this shouldn't really happen but just covering bases
                    throw new SimpleError(`Component wanted transformer type ${data.type} with name ${data.name}. Transforms of this type are registered but none have this name.`);
                }
                return namedTransformer;
            }
            throw new SimpleError(`Component wanted transformer type ${data.type} with name ${data.name}. Transforms of this type are registered but none have this name.`);
        }
        return namedTransformer;
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

    public async getTrackResults(query: string): Promise<AggregateMetadataResponse<TrackSearchResult>> {
        const readyMps: Record<string, Promise<Awaited<ReturnType<MetadataProvider['getTrackResults']>>>> = {};
        for(const [type, name] of Object.entries(this.transformMetadataProviders)) {
            const t = this.transformers.get(type)?.get(name.toLocaleLowerCase()) as unknown as MetadataProvider & AbstractTransformer;
            if(t !== undefined && t.isReady()) {
                readyMps[type] = t.getTrackResults(query);
            }
        }
        const all = await pPropsAllSettled(readyMps);
        const res: AggregateMetadataResponse<TrackSearchResult> = {
            data: [],
            errors: []
        }
        for(const [name, r] of Object.entries(all)) {
            if(r.status === 'fulfilled') {
                if(r.value === false) {
                    res.errors.push({service: name, error: {message: 'Not Ready'}});
                } else {
                    res.data = res.data.concat(r.value)
                }
            } else {
                res.errors.push({service: name, error: r.reason});
            }
        }
        res.data.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        return res;
    }
    public async getArtistResults(query: string): Promise<AggregateMetadataResponse<ArtistSearchResult>> {
        const readyMps: Record<string, Promise<Awaited<ReturnType<MetadataProvider['getArtistResults']>>>> = {};
        for(const [type, name] of Object.entries(this.transformMetadataProviders)) {
            const t = this.transformers.get(type)?.get(name.toLocaleLowerCase()) as unknown as MetadataProvider & AbstractTransformer;
            if(t !== undefined && t.isReady()) {
                readyMps[type] = t.getArtistResults(query);
            }
        }
        const all = await pPropsAllSettled(readyMps);
        const res: AggregateMetadataResponse<ArtistSearchResult> = {
            data: [],
            errors: []
        }
        for(const [name, r] of Object.entries(all)) {
            if(r.status === 'fulfilled') {
                if(r.value === false) {
                    res.errors.push({service: name, error: {message: 'Not Ready'}});
                } else {
                    res.data = res.data.concat(r.value)
                }
            } else {
                res.errors.push({service: name, error: r.reason});
            }
        }
        res.data.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        return res;
    }
    public async getAlbumResults(query: string): Promise<AggregateMetadataResponse<AlbumSearchResult>> {
        const readyMps: Record<string, Promise<Awaited<ReturnType<MetadataProvider['getAlbumResults']>>>> = {};
        for(const [type, name] of Object.entries(this.transformMetadataProviders)) {
            const t = this.transformers.get(type)?.get(name.toLocaleLowerCase()) as unknown as MetadataProvider & AbstractTransformer;
            if(t !== undefined && t.isReady()) {
                readyMps[type] = t.getAlbumResults(query);
            }
        }
        const all = await pPropsAllSettled(readyMps);
        const res: AggregateMetadataResponse<AlbumSearchResult> = {
            data: [],
            errors: []
        }
        for(const [name, r] of Object.entries(all)) {
            if(r.status === 'fulfilled') {
                if(r.value === false) {
                    res.errors.push({service: name, error: {message: 'Not Ready'}});
                } else {
                    res.data = res.data.concat(r.value)
                }
            } else {
                res.errors.push({service: name, error: r.reason});
            }
        }
        res.data.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        return res;
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