import { childLogger, type Logger } from "@foxxmd/logging";
import type AbstractTransformer from "./AbstractTransformer.ts";
import type {MusicServicesBase, OptionalCacheUsage, TransformerCommon, TransformerCommonConfig} from "../../../core/Atomic.ts";
import {DEFAULT_TRANSFORMER_ENV_NAME, DEFAULT_TRANSFORMER_NAME, META_PROVIDER_STAGE_TYPES, metadataPreferredProviderSchema, type MetadataPreferredProviders, type MetadataProviderStageType, type StageConfig} from "../../../core/Transform.ts";
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
import type { AlbumSearchResult, ArtistSearchResult, MetadataSearchStreamLine, TrackDataCreditBase, TrackSearchResult } from "../../../core/Api.ts";
import { serializeError } from "serialize-error";

/** A stream line that carries a single provider's outcome */
export type MetadataProviderLine<T> = Exclude<MetadataSearchStreamLine<T>, {type: 'done'}>;

type TransformNamedMap = Map<string, AbstractTransformer>;
type TransformTypedMap = Map<string,TransformNamedMap>;
export default class TransformerManager {

    public logger: Logger;
    protected parentLogger: Logger;
    protected transformers: TransformTypedMap = new Map();
    protected cache: MSCache;
    protected asyncStore: AsyncLocalStorage<string>;

    protected transformerConfigs: TransformerCommon[] = [];

    protected transformMetadataProviders: Partial<Record<MetadataProviderStageType, string>> = {};
    protected transformMetadataPreferredProviders: MetadataPreferredProviders | undefined;

    /** One register + initialize attempt per transformer, keyed by type and name */
    protected ready: Map<string, Promise<AbstractTransformer>> = new Map();
    protected metadataInit?: Promise<void>;

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

    public setPreferredProviders(val: MetadataPreferredProviders | Record<string, string | true | undefined>) {
        const res = metadataPreferredProviderSchema.safeParse(val);
        if(res.success) {
            this.transformMetadataPreferredProviders = res.data;
            let providerOrder: string = 'none enabled';
            const ent = Object.entries(this.transformMetadataPreferredProviders);
            if(ent.length !== 0) {
                providerOrder = ent.map(([key, val]) => `${key}:${val}`).join(' | ');
            }
            this.logger.verbose(`Preferred metadata providers set. Will only use these providers: ${providerOrder}`)
        } else {
            this.logger.warn(new SimpleError('Failed to set preferred providers because the config is not valid. Will fallback to using any available.', {cause: res.error}));
        }
    }

    public async register(config: TransformerCommon): Promise<AbstractTransformer> {
        // TODO replace with getOrInsert in node 26+
        let namedTransformerMap = this.transformers.get(config.type.toLocaleLowerCase().trim());
        if(namedTransformerMap === undefined) {
            namedTransformerMap = new Map();
            this.transformers.set(config.type.toLocaleLowerCase().trim(), namedTransformerMap);
        }

        if (namedTransformerMap.has(config.name.toLocaleLowerCase().trim())) {
            throw new Error(`Cannot register ${config.type} transformer with name '${config.name}' because an existing transformer already has that name`);
        }

        if(!this.hasTransformerConfigByIdentifiers(config.type, config.name)) {
            this.transformerConfigs.push({...config, type: config.type.toLocaleLowerCase().trim()});
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
        return t;
    }

    protected transformerKey(config: TransformerCommon): string {
        return `${config.type}:${config.name}`.toLocaleLowerCase().trim();
    }

    /**
     * Register (if needed) and initialize a single transformer, once.
     *
     * Callers only wait on the transformer they asked for. A failed initialization is logged and the (not ready) transformer is still returned.
     * */
    protected ensure(config: TransformerCommon): Promise<AbstractTransformer> {
        const key = this.transformerKey(config);
        let p = this.ready.get(key);
        if(p === undefined) {
            const existing = this.transformers.get(config.type.toLocaleLowerCase().trim())?.get(config.name.toLocaleLowerCase().trim());
            p = (existing !== undefined ? Promise.resolve(existing) : this.register(config)).then(t => this.initTransformer(t));
            // only a failed registration rejects, let it be tried again
            p.catch(() => this.ready.delete(key));
            this.ready.set(key, p);
        }
        return p;
    }

    protected async initTransformer(transformer: AbstractTransformer): Promise<AbstractTransformer> {
        if (!transformer.isReady() && !transformer.initializing) {
            if (!transformer.canAuthUnattended()) {
                transformer.logger.warn({ label: 'Heartbeat' }, 'Transformer is not ready but will not try to initialize because auth state is not good and cannot be correct unattended.');
            }
            try {
                await transformer.initialize({ force: false, notify: true, notifyTitle: 'Could not initialize automatically' });
            } catch (e) {
                transformer.logger.error(new Error('Could not initialize source automatically', { cause: e }));
            }
        }
        return transformer;
    }

    public async parseFromEnv() {
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

    protected configByPriority(type: string): TransformPriorityObj<TransformerCommon> {
        return getTransformByPriority(this.transformerConfigs.filter(x => x.type === type));
    }

    /**
     * Register and initialize the transformers used as metadata providers, once, on first use
     * */
    protected initMetadataProviders(): Promise<void> {
        return this.metadataInit ??= (async () => {
            const preferred = this.transformMetadataPreferredProviders;
            const configs: TransformerCommon[] = [];
            for(const t of META_PROVIDER_STAGE_TYPES.options) {
                const pref = preferred?.[t];
                if(preferred !== undefined && pref === undefined) {
                    // only use transformers user prefers and don't add any they don't explicitly set
                    this.logger.debug(`Preferred metadata providers are defined but type ${t} is not set, skipping`);
                    continue;
                }
                let config: TransformerCommon | undefined;
                if(typeof pref === 'string') {
                    config = this.transformerConfigs.find(x => x.type === t && x.name.toLocaleLowerCase() === pref.toLocaleLowerCase().trim());
                } else {
                    const p = this.configByPriority(t);
                    config = p.nonDefault ?? p.env ?? p.default;
                }
                if(config === undefined) {
                    this.logger.debug(`No usable ${t} transformer config for metadata provider`);
                    continue;
                }
                this.logger.debug(`Using ${t} transformer '${config.name}' as metadata provider.`);
                this.transformMetadataProviders[t] = config.name;
                configs.push(config);
            }
            const results = await Promise.allSettled(configs.map(x => this.ensure(x)));
            results.forEach((r, i) => {
                const config = configs[i];
                if(r.status === 'rejected') {
                    this.logger.error(new Error(`Could not register ${config.type} transformer '${config.name}' as metadata provider`, {cause: r.reason}));
                    delete this.transformMetadataProviders[config.type as MetadataProviderStageType];
                } else if(!asMetadataProvider(r.value)) {
                    delete this.transformMetadataProviders[config.type as MetadataProviderStageType];
                }
            });
        })();
    }

    public hasTransformerType(type: string): boolean {
        return this.transformers.has(type);
    }

    public getTransformerType(type: string): TransformNamedMap | undefined {
        return this.transformers.get(type);
    }

    public async getTransformerByStage(data: StageConfig): Promise<AbstractTransformer> {
        const transformType: string = data.type.toLocaleLowerCase().trim();

        if(!this.hasTransformerConfigByType(transformType)) {
            throw new Error(`No transformer configurations of type '${transformType}' exist.`);
        }

        let config: TransformerCommon | undefined;
        if(data.name !== undefined) {
            const configName = data.name.toLocaleLowerCase().trim();
            config = this.transformerConfigs.find(x => x.type === transformType && x.name.toLocaleLowerCase() === configName);
            if(config === undefined) {
                throw new Error(`No transformer configuration of type '${transformType}' with name '${data.name}' exists.`);
            }
        } else {
            // otherwise we try to get *any* transform of this type, starting with non-default, then env, then default
            const configs = this.configByPriority(transformType);
            config = configs.nonDefault ?? configs.env ?? configs.default;
            if(config === undefined) {
                // shouldn't happen at this point but covering strict ts
                throw new Error(`No transformer configurations of type '${transformType}' exist.`);
            }
            if(!this.ready.has(this.transformerKey(config))) {
                if(configs.nonDefaultMany) {
                    this.logger.warn(`No config name specified and more than one non-default exists. Using the first found non-default (${config.name})`);
                } else {
                    this.logger.verbose(`No config name specified, using ${config.name}`);
                }
            }
        }

        return await this.ensure(config);
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

    /** Yields each ready metadata provider's results, or its error, as soon as that provider settles */
    protected async *streamResults<T extends TrackSearchResult | ArtistSearchResult | AlbumSearchResult>(method: keyof MetadataProvider, query: TrackDataCreditBase | MusicServicesBase): AsyncGenerator<MetadataProviderLine<T>> {
        await this.initMetadataProviders();
        const pending = new Map<string, Promise<MetadataProviderLine<T>>>();
        for(const [type, name] of Object.entries(this.transformMetadataProviders)) {
            const t = this.transformers.get(type)?.get(name.toLocaleLowerCase()) as unknown as MetadataProvider & AbstractTransformer;
            if(t !== undefined && t.isReady()) {
                pending.set(type, (t[method](query) as Promise<T[] | false>).then(
                    (data): MetadataProviderLine<T> => data === false
                        ? {type: 'error', service: type, error: {message: 'Not Ready'}}
                        : {type: 'result', service: type, data},
                    (e): MetadataProviderLine<T> => ({type: 'error', service: type, error: serializeError(e)})
                ));
            }
        }
        while(pending.size > 0) {
            const line = await Promise.race(pending.values());
            pending.delete(line.service);
            yield line;
        }
    }

    protected async aggregateResults<T extends TrackSearchResult | ArtistSearchResult | AlbumSearchResult>(method: keyof MetadataProvider, query: TrackDataCreditBase | MusicServicesBase): Promise<AggregateMetadataResponse<T>> {
        const res: AggregateMetadataResponse<T> = {
            data: [],
            errors: []
        }
        for await (const line of this.streamResults<T>(method, query)) {
            if(line.type === 'result') {
                res.data = res.data.concat(line.data);
            } else {
                res.errors.push({service: line.service, error: line.error});
            }
        }
        res.data.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        return res;
    }

    public async getTrackResults(query:TrackDataCreditBase | MusicServicesBase): Promise<AggregateMetadataResponse<TrackSearchResult>> {
        return this.aggregateResults<TrackSearchResult>('getTrackResults', query);
    }
    public async getArtistResults(query: TrackDataCreditBase | MusicServicesBase): Promise<AggregateMetadataResponse<ArtistSearchResult>> {
        return this.aggregateResults<ArtistSearchResult>('getArtistResults', query);
    }
    public async getAlbumResults(query: TrackDataCreditBase | MusicServicesBase): Promise<AggregateMetadataResponse<AlbumSearchResult>> {
        return this.aggregateResults<AlbumSearchResult>('getAlbumResults', query);
    }

    public streamTrackResults(query: TrackDataCreditBase | MusicServicesBase): AsyncGenerator<MetadataProviderLine<TrackSearchResult>> {
        return this.streamResults<TrackSearchResult>('getTrackResults', query);
    }
    public streamArtistResults(query: TrackDataCreditBase | MusicServicesBase): AsyncGenerator<MetadataProviderLine<ArtistSearchResult>> {
        return this.streamResults<ArtistSearchResult>('getArtistResults', query);
    }
    public streamAlbumResults(query: TrackDataCreditBase | MusicServicesBase): AsyncGenerator<MetadataProviderLine<AlbumSearchResult>> {
        return this.streamResults<AlbumSearchResult>('getAlbumResults', query);
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