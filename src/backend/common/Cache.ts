import { Cacheable, createKeyv, Keyv, KeyvStoreAdapter, KeyvOptions, CacheableOptions, KeyvCacheableMemory } from 'cacheable';
import { FlatCache, FlatCacheOptions } from 'flat-cache';
import KeyvValkey, { KeyvValkeyOptions } from '@keyv/valkey';
import dayjs, { Dayjs } from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import isToday from 'dayjs/plugin/isToday.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import clone from 'clone';
import { childLogger, Logger } from '@foxxmd/logging';
import { projectDir } from './index.js';
import path from 'path';
import { cacheFunctions } from "@foxxmd/regex-buddy-core";
import { fileExists, fileOrDirectoryIsWriteable } from '../utils/FSUtils.js';
import { copyFile } from 'fs/promises';
import { asCacheConfig, CacheAuthProvider, CacheConfig, CacheConfigOptions, CacheConfigUser, CacheScrobbleProvider } from './infrastructure/Atomic.js';
import { Typeson } from 'typeson';
import { builtin } from 'typeson-registry';
import { loggerNoop } from './MaybeLogger.js';
const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
import prom, { Gauge } from 'prom-client';
import { nonEmptyStringOrDefault } from '../../core/StringUtils.js';

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);

const typeson = new Typeson().register([
    builtin,
]);
typeson.register({
    Dayjs: [
        (x) => dayjs.isDayjs(x),
        (d: Dayjs) => d.toJSON(),
        (date) => dayjs(date)
    ]
});

const unsupportedEnvKeys = [
    'CACHE_AUTH_CONN',
    'CACHE_METADATA',
    'CACHE_SCROBBLE',
    'CACHE_SCROBBLE_CONN',
    'CACHE_AUTH_CONN'
];

export class MSCache {

    config: Required<CacheConfigOptions>

    cacheMetadata: Cacheable;
    cacheScrobble: Cacheable;
    cacheDb: Cacheable;
    cacheAuth: Cacheable;
    regexCache: ReturnType<typeof cacheFunctions>;
    cacheTransform: Cacheable;
    cacheClientScrobbles: Cacheable;
    cacheApi: Cacheable;
    hasInit: boolean = false;

    logger: Logger;

    cacheHits: Gauge;
    cacheMisses: Gauge;
    cacheSets: Gauge;
    cacheCount: Gauge;
    //cacheVSize: Gauge;

    constructor(logger: Logger, config: CacheConfigOptions = {}) {
        this.logger = childLogger(logger, 'Cache');

        const {
            metadata: {
                provider: mProvider = false,
                connection: mConn,
                //...restMetadata
            } = {},
            scrobble: {
                provider: sProvider = false,
                connection: sConnection,
                //...restScrobble
            } = {},
            auth: {
                provider: aProvider = false,
                connection: aConn,
                //...restAuth
            } = {},
            regex = 200,
        } = config;

        this.config = {
            metadata: {
                provider: mProvider,
                connection: mConn,
            },
            scrobble: {
                provider: sProvider,
                connection: sConnection,
            },
            auth: {
                provider: aProvider,
                connection: aConn,
            },
            regex
        };

        this.regexCache = cacheFunctions(this.config.regex);

        // for testing we default to in memory
        const inMemory = new Cacheable({primary: initMemoryCache({lruSize: 500, ttl: '1m'})});
        this.cacheTransform = inMemory;
        this.cacheClientScrobbles = inMemory;
        this.cacheMetadata = inMemory;
        this.cacheAuth = inMemory;
        this.cacheScrobble = inMemory;
        this.cacheApi = inMemory;
        this.cacheDb = new Cacheable({primary: initMemoryCache({lruSize: 500, ttl: '1m'})});
    }

    init = async (enableCollectors: boolean = false) => {
        await this.initMetadataCache();
        await this.initScrobbleCache();
        await this.initAuthCache();

        if(enableCollectors) {
            this.enableCollectors();
        }
    }

    protected enableCollectors = () => {

        const collectors: {cache: Cacheable, name: string}[] = [
            { cache: this.cacheMetadata, name: 'metadata' },
            { cache: this.cacheScrobble, name: 'queued_scrobbles' },
            { cache: this.cacheTransform, name: 'transformer' },
            { cache: this.cacheClientScrobbles, name: 'historical_scrobbles' },
            { cache: this.cacheApi, name: 'external_apis' },
            { cache: this.cacheDb, name: 'database' }
        ];

        this.cacheHits = new prom.Gauge({
            name: 'multiscrobbler_cache_hits',
            help: 'cache hits',
            labelNames: ['cacheType', 'tier'],
            collect() {
                for(const set of collectors) {
                    const [primary, secondary] = getStat(set.cache, 'hits');
                    this.labels({cacheType: set.name, tier: 'primary'}).set(primary);
                    if(secondary !== undefined) {
                        this.labels({cacheType: set.name, tier: 'secondary'}).set(secondary);
                    }
                }

            }
        });
        this.cacheMisses = new prom.Gauge({
            name: 'multiscrobbler_cache_misses',
            help: 'cache misses',
            labelNames: ['cacheType', 'tier'],
            collect() {
                for(const set of collectors) {
                    const [primary, secondary] = getStat(set.cache, 'misses');
                    this.labels({cacheType: set.name, tier: 'primary'}).set(primary);
                    if(secondary !== undefined) {
                        this.labels({cacheType: set.name, tier: 'secondary'}).set(secondary);
                    }
                }

            }
        });

        this.cacheMisses = new prom.Gauge({
            name: 'multiscrobbler_cache_sets',
            help: 'cache sets',
            labelNames: ['cacheType', 'tier'],
            collect() {
                for(const set of collectors) {
                    const [primary, secondary] = getStat(set.cache, 'sets');
                    this.labels({cacheType: set.name, tier: 'primary'}).set(primary);
                    if(secondary !== undefined) {
                        this.labels({cacheType: set.name, tier: 'secondary'}).set(secondary);
                    }
                }

            }
        });

        this.cacheCount = new prom.Gauge({
            name: 'multiscrobbler_cache_count',
            help: 'number of keys in cache',
            labelNames: ['cacheType', 'tier'],
            collect() {
                for(const set of collectors) {
                    const [primary] = getStat(set.cache, 'count', false);
                    this.labels({cacheType: set.name, tier: 'primary'}).set(primary);
                }
            }
        });

        // this.cacheVSize = new prom.Gauge({
        //     name: 'multiscrobbler_cache_vsize',
        //     help: 'estimated byte size of values in cache',
        //     labelNames: ['cacheType', 'tier'],
        //     collect() {
        //         for(const set of collectors) {
        //             const [primary] = getStat(set.cache, 'vsize', false);
        //             this.labels({cacheType: set.name, tier: 'primary'}).set(primary);
        //         }
        //     }
        // });
    }

    protected initCacheable = async (cacheFor: string, primaryConfig: CacheConfig, secondaryConfig?: CacheConfig) => {

        let logger = childLogger(this.logger, cacheFor);
        const providerHints = [];
        if(primaryConfig.provider === false) {
            const cache = new Cacheable({primary: noopKeyv});
            cache.stats.enabled = true;
            logger.verbose(`Cache Providers: Disabled`);
            return cache;
        }

        providerHints.push(`${primaryConfig.provider} (Primary)`)

        if(secondaryConfig === undefined || secondaryConfig.provider !== false) {
            providerHints.push(`Disabled (Secondary)`)
        } else {
            providerHints.push(`${secondaryConfig.provider} (Secondary)`);
        }
        logger.verbose(`Cache Providers: ${providerHints.join(' | ')}`);

        const ns = `ms-${cacheFor.toLocaleLowerCase()}`;

        const cacheOpts: CacheableOptions = {

        }

        try {
            cacheOpts.primary = await this.initCachableType(ns, primaryConfig, logger);
        } catch (e) {
            throw new Error('Could not init primary cache', {cause: e});
        }

        if(secondaryConfig !== undefined && secondaryConfig.provider !== false) {
            try {
                cacheOpts.secondary = await this.initCachableType(ns, secondaryConfig, logger);
            } catch (e) {
                this.logger.warn(e);
            }
        }

        const cache = new Cacheable(cacheOpts);
        cache.stats.enabled = true;
        return cache;

    }

    protected initCachableType = async (namespace: string, config: CacheConfig, logger: Logger): Promise<Keyv<any> | KeyvStoreAdapter> => {

        if (config.provider === 'memory') {
            return initMemoryCache({ namespace, lruSize: config.lruSize, ttl: config.ttl });
        }

        if (config.provider === 'valkey') {
            logger.debug(`Building valkey cache from ${config.connection}`);
            try {
                const cache = await initValkeyCache(namespace, config.connection, undefined, {ttl: config.ttl});
                logger.debug('valkey cache connected');
                return cache;
            } catch (e) {
                throw e;
            }
        }
        if (config.provider === 'file') {
            logger.debug(`Building file cache from ${path.join(config.connection ?? configDir, `${namespace}.cache`)}`);

            try {
                const [keyvFile] = await initFileCache({ ...config, cacheDir: config.connection ?? configDir, cacheId: `${namespace}.cache` }, {ttl: config.ttl}, logger);
                return keyvFile;
            } catch (e) {
                throw e;
            }
        }
    }

    initScrobbleCache = async () => {
        if (!this.hasInit) {
            let scrobbleConfig: CacheConfig | undefined;
            try {
                if(asCacheConfig(this.config.scrobble)) {
                    scrobbleConfig = this.config.scrobble;
                    this.cacheScrobble = await this.initCacheable('Scrobble', this.config.scrobble);
                }
            } catch (e) {
                this.logger.warn(new Error('Could not validate scrobble config! No fallback is possible', {cause: e}));
                this.cacheScrobble = await this.initCacheable('Scrobble', {provider: false});
            }
        }
    }

    initMetadataCache = async () => {
        if (!this.hasInit) {
            let metadataConfig: CacheConfig | undefined;
            try {
                if(asCacheConfig(this.config.metadata)) {
                    metadataConfig = this.config.metadata;
                }
            } catch (e) {
                this.logger.warn(new Error('Could not validate metadata config, will fallback to memory cache only', {cause: e}));
            }
            this.cacheMetadata = await this.initCacheable('Metadata', {provider: 'memory', ttl: '3m', lruSize: 100}, metadataConfig === undefined ? undefined : {...this.config.metadata, ttl: '15m'});
            this.cacheMetadata.stats.enabled = true;
            this.cacheClientScrobbles = await this.initCacheable('Historical Scrobbles', {provider: 'memory', ttl: '2m', lruSize: 50}, metadataConfig === undefined ? undefined : {...this.config.metadata, ttl: '10m'});
            this.cacheClientScrobbles.stats.enabled = true;
            this.cacheTransform = await this.initCacheable('Transform Data', {provider: 'memory', ttl: '2m', lruSize: 100}, metadataConfig === undefined ? undefined : {...this.config.metadata, ttl: '5m'});
            this.cacheTransform.stats.enabled = true;
            this.cacheApi = await this.initCacheable('External API Responses', {provider: 'memory', ttl: '30s', lruSize: 100}, metadataConfig === undefined ? undefined : {...this.config.metadata, ttl: '20m'});
            this.cacheApi.stats.enabled = true;
        }
    }

    initAuthCache = async () => {
        if (!this.hasInit) {
            let authConfig: CacheConfig | undefined;
            try {
                if(asCacheConfig(this.config.scrobble)) {
                    authConfig = this.config.auth;
                }
            } catch (e) {
                this.logger.warn(new Error('Could not validate auth config! will fallback to memory cache only', {cause: e}));
                this.cacheScrobble = await this.initCacheable('Scrobble', {provider: false});
            }

            this.cacheAuth = await this.initCacheable('Auth', {provider: 'memory', ttl: '3m'}, authConfig);
        }
    }

}


export const initMemoryCache = <T = any>(opts: Parameters<typeof createKeyv>[0] = {}): Keyv<T> | KeyvStoreAdapter => {
    const {
        ttl = '60s',
        lruSize = 200,
        ...restOpts
    } = opts;
    const memory = createKeyv({
        ttl,
        lruSize,
        // millisecond interval before checking for expired keys and deleting
        checkInterval: 10000,
        ...restOpts,
        useClone: false,
    });
    // structuredClone does not work well with dayjs https://github.com/iamkun/dayjs/issues/2236
    // but deep cloning is fine so disable useClone and provide our own cloning function
    memory.serialize = (data) => {
        return clone(data) as string;
    }
    memory.stats.enabled = true;
    return memory;
}

export const flatCacheCreate = (opts: FlatCacheOptions) => {
    return new FlatCache({
        ttl: 0,
        lruSize: 2000,
        cacheDir: opts.cacheDir,
        cacheId: opts.cacheId ?? 'ms.cache',
        persistInterval: 1 * 1000 * 10,
        expirationInterval: 1 * 1000 * 10, // 10 seconds
        ...opts
    });
}

export const flatCacheLoad = async (flatCache: FlatCache, logger: Logger = loggerNoop): Promise<void> => {

    const cachePath = path.join(flatCache.cacheDir, flatCache.cacheId);
    try {
        fileOrDirectoryIsWriteable(cachePath);
    } catch (e) {
        throw new Error(`Unable to use path for file cache at ${cachePath}`, { cause: e })
    }

    if(fileExists(cachePath) && !fileExists(`${cachePath}.bak`)) {
        logger.info(`Backing up ${cachePath} in preparation for migration to database...`);
        await copyFile(cachePath, `${cachePath}.bak`);
        logger.info(`Done! Backed up to ${cachePath}.bak\nAll data has been loaded into cache. It will be deleted (from cache) after migrating to database.\nIf there are migration issues or you wish to downgrade then overwrite ${cachePath} with the .bak backup copy`);
    }

    const streamPromise = new Promise((resolve, reject) => {
        flatCache.loadFileStream(cachePath, (progress: number, total: number) => {
            logger.trace(`Loading ${progress}/${total} chunks...`);
        }, () => {
            resolve(true);
        }, (err: Error) => {
            reject(err);
        });
    });

    try {
        await streamPromise;
        logger.debug(`File cache loaded`);
        return;
    } catch (e) {
        if (null !== e.message.match(/Cache file .+ does not exist/)) {
            let loadError: Error;
            try {
                const onlySaveError = (e: Error) => {
                    loadError = e;
                };
                flatCache.on('error', onlySaveError);
                flatCache.load();
                if (loadError !== undefined) {
                    throw loadError;
                }
                flatCache.off('error', onlySaveError);
                logger.debug(`File cache loaded`);
                return;
            } catch (e) {
                throw new Error(`Unable to use file cache at ${cachePath}`, { cause: e });
            }
        } else {
            throw new Error(`Unable to use file cache at ${cachePath}`, { cause: e });
        }
    }
}

export const initFileCache = async (opts: FlatCacheOptions = {}, keyvOpts: KeyvOptions = {}, logger: Logger = loggerNoop): Promise<[Keyv | KeyvStoreAdapter | undefined, FlatCache | undefined]> => {
    const flatCache = flatCacheCreate(opts);
    try {
        await flatCacheLoad(flatCache, logger);
        flatCache.on('error', (e) => {
            logger.warn(e);
        });
        flatCache.on('save', () => {
            logger.debug('Saved cache to file');
        });

        const cache = new Keyv({
            store: flatCache,
            throwOnErrors: true,
            ...typesonMarshalling,
            ...keyvOpts
        });
        cache.stats.enabled = true;
        return [cache, flatCache];
    } catch (e) {
        throw e;
    }
}

export const valkeyCacheCreate = (ns: string, connection: string, valkeyOpts: KeyvValkeyOptions = {}, keyvOpts: KeyvOptions = {}): Keyv => {
    const valkey = new KeyvValkey(connection, { maxRetriesPerRequest: 5, connectTimeout: 1100, ...valkeyOpts });
    const kv = new Keyv({
        store: valkey,
        throwOnErrors: true,
        namespace: ns,
        ...typesonMarshalling,
        ...keyvOpts
    });
    kv.stats.enabled = true;
    return kv;
}

export const initValkeyCache = async (ns: string, connection: string, valkeyOpts: KeyvValkeyOptions = {}, keyvOpts: KeyvOptions = {}): Promise<Keyv> => {
    const kv = valkeyCacheCreate(ns, connection, valkeyOpts, keyvOpts);
    try {
        await kv.get('test');
        return kv;
    } catch (e) {
        throw new Error(`Unable to connect to cache ${connection}`, { cause: e })
    }
}

const typesonMarshalling: Pick<KeyvOptions, 'serialize' | 'deserialize'> = {
    serialize: (data) => {
        const str = typeson.stringifySync(data);
        return str;
    },
    deserialize: (str) => {
        const data = typeson.parseSync(str);
        return data;
    }
}

const getStat = (cache: Cacheable, statName: string, getSecondary: boolean = true): [number, number?] => {
    let primary = cache.stats[statName];
    if(statName === 'count' && cache.primary.store instanceof KeyvCacheableMemory) {
        primary = cache.primary.store.store.size;
    }
    let secondary: number;
    if(getSecondary && cache.secondary !== undefined) {
        secondary = cache.secondary.stats[statName];
    }
    return [primary, secondary];
}

const noopKeyv: KeyvStoreAdapter = {
        opts: {},
        namespace: 'noop',
        get: (_) => undefined,
        set: (_, __, ___) => undefined,
        delete: (_) => undefined,
        clear: () => Promise.resolve(),
        on: (_, __) => undefined
}

export const parseUserConfig = (config: CacheConfigUser = {}, parentLogger: Logger = loggerNoop): CacheConfigOptions => {
    const logger = childLogger(parentLogger, 'Cache');

        let valkeyEnvVal: string | undefined = nonEmptyStringOrDefault(process.env.CACHE_VALKEY);
        if(valkeyEnvVal === undefined) {
            valkeyEnvVal = nonEmptyStringOrDefault(process.env.CACHE_METADATA_CONN);
            if(valkeyEnvVal !== undefined) {
                logger.warn('ENV CACHE_METADATA_CONN is deprecated! Replace it with CACHE_VALKEY');
            }
        }

        for(const key of unsupportedEnvKeys) {
            if(nonEmptyStringOrDefault(process.env[key]) !== undefined) {
                logger.warn(`ENV ${key} is no longer supported. Refer to the Caching docs.`);
            }
        }

        const {
            valkey = valkeyEnvVal,
            // metadata: {
            //     provider: mProvider = (process.env.CACHE_METADATA as (CacheMetadataProvider | undefined) ?? false),
            //     connection: mConn = process.env.CACHE_METADATA_CONN,
            //     //...restMetadata
            // } = {},
            scrobble: {
                provider: sProvider = (process.env.CACHE_SCROBBLE as (CacheScrobbleProvider | undefined) ?? 'file'),
                connection = (process.env.CACHE_SCROBBLE_CONN ?? configDir),
                ...restScrobble
            } = {},
            auth: {
                provider: aProvider = (process.env.CACHE_AUTH as (CacheAuthProvider | undefined) ?? 'file'),
                //...restAuth
            } = {},
            regex = 200,
        } = config;

        if(config.metadata !== undefined) {
            logger.warn('Configuring cache.metadata is no longer supported. Refer to the Caching docs.');
        }
        if(config.scrobble !== undefined) {
            logger.warn('Configuring cache.scrobble is no longer supported. Refer to the Caching docs.');
        }
        if(config.auth?.connection !== undefined) {
            logger.warn('Configuring cache.auth.connection is no longer supported. Refer to the Caching docs.');
        }
        
        let authConn: string,
        authProvider = aProvider;
        if(authProvider === 'valkey') {
            if(valkey === undefined) {
                logger.warn(`Auth Provider set to 'valkey' but not valkey connection string was not provided, falling back to file.`);
                authConn = configDir;
                authProvider = 'file';
            } else {
                authConn = valkey;
            }
        } else {
            if(authProvider !== 'file') {
                logger.warn(`Unsupported provider given for auth: ${authProvider}`);
            }
            authConn = configDir;
            authProvider = 'file';
        }

        return {
            metadata: {
                provider: valkey !== undefined ? 'valkey' : false,
                connection: valkey,
            },
            scrobble: {
                provider: sProvider,
                connection,
                ...restScrobble
            },
            auth: {
                provider: authProvider,
                connection: authConn,
            },
            regex
        };
}