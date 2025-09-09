import { Cacheable, createKeyv, Keyv, KeyvStoreAdapter, KeyvOptions, CacheableOptions } from 'cacheable';
import { FlatCache, FlatCacheOptions } from 'flat-cache';
import KeyvValkey from '@keyv/valkey';
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
import { fileOrDirectoryIsWriteable } from '../utils.js';
import { asCacheMetadataProvider, asCacheScrobbleProvider, CacheConfig, CacheConfigOptions, CacheMetadaProvider, CacheProvider, CacheScrobbleProvider } from './infrastructure/Atomic.js';
import { Typeson } from 'typeson';
import { builtin } from 'typeson-registry';
import { MaybeLogger } from './logging.js';
import { ListenProgressPositional, ListenProgressTS } from '../sources/PlayerState/ListenProgress.js';
const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);

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
    ],
    ListenProgressTS,
    ListenProgressPositional
});

export class MSCache {

    config: Required<CacheConfigOptions>

    cacheMetadata: Cacheable;
    cacheScrobble: Cacheable;

    logger: Logger;

    constructor(logger: Logger, config: CacheConfigOptions = {}) {
        this.logger = childLogger(logger, 'Cache');

        const {
            metadata: {
                provider: mProvider = (process.env.CACHE_METADATA as (CacheMetadaProvider | undefined) ?? 'memory'),
                connection: mConn = process.env.CACHE_METADATA_CONN,
                ...restMetadata
            } = {},
            scrobble: {
                provider: sProvider = (process.env.CACHE_SCROBBLE as (CacheScrobbleProvider | undefined) ?? 'file'),
                connection = (process.env.CACHE_SCROBBLE_CONN ?? configDir),
                ...restScrobble
            } = {},
        } = config;

        this.config = {
            metadata: {
                provider: mProvider,
                connection: mConn,
                ...restMetadata,
            },
            scrobble: {
                provider: sProvider,
                connection,
                ...restScrobble
            }
        };
    }

    init = async () => {
        // disabled for now
        //await this.initMetadataCache();
        await this.initScrobbleCache();
    }

    protected initCacheable = async (config: CacheConfig, cacheFor: string) => {

        let logger = childLogger(this.logger, cacheFor);
        const providerHints = ['In-Memory (Primary)'];
        if(config.provider !== false) {
            providerHints.push(`${config.provider} (Secondary)`)
        }
        logger.verbose(`Cache Providers: ${providerHints.join(' | ')}`)

        const ns = `ms-${cacheFor.toLocaleLowerCase()}`;

        const cacheOpts: CacheableOptions = {
            primary: initMemoryCache({ namespace: ns })
        }

        let secondaryCache: Keyv | KeyvStoreAdapter | undefined;

        if (config.provider === 'valkey') {
            logger.debug(`Building valkey cache from ${config.connection}`);
            try {
                secondaryCache = await initValkeyCache(ns, config.connection);
                logger.debug('valkey cache connected');
            } catch (e) {
                this.logger.warn(e);
            }
        } else if (config.provider === 'file') {
            logger.debug(`Building file cache from ${path.join(config.connection, `${ns}.cache`)}`);

            try {
                const [keyvFile] = await initFileCache({ ...config, cacheDir: config.connection, cacheId: `${ns}.cache` }, logger);
                secondaryCache = keyvFile;
            } catch (e) {
                logger.warn(e);
            }
        }

        if(secondaryCache !== undefined) {
            cacheOpts.secondary = secondaryCache;
        }
        return new Cacheable(cacheOpts);

    }

    initScrobbleCache = async () => {
        if (this.cacheScrobble === undefined) {
            if (!asCacheScrobbleProvider(this.config.scrobble.provider)) {
                throw new Error(`Cache Scrobble provider '${this.config.scrobble.provider}' must be one of: memory, valkey, file`);
            }

            this.cacheScrobble = await this.initCacheable(this.config.scrobble, 'Scrobble');
        }
    }

    initMetadataCache = async () => {
        if (this.cacheMetadata === undefined) {
            if (!asCacheMetadataProvider(this.config.metadata.provider)) {
                throw new Error(`Cache Metadata provider '${this.config.metadata.provider}' must be one of: memory, valkey`);
            }

            this.cacheMetadata = await this.initCacheable(this.config.metadata, 'Metadata');
        }
    }
}


export const initMemoryCache = (opts: Parameters<typeof createKeyv>[0] = {}): Keyv | KeyvStoreAdapter => {
    const memory = createKeyv({
        ttl: '1h',
        lruSize: 200,
        ...opts,
        useClone: false,
    });
    // structuredClone does not work well with dayjs https://github.com/iamkun/dayjs/issues/2236
    // but deep cloning is fine so disable useClone and provide our own cloning function
    memory.serialize = (data) => {
        return clone(data) as string;
    }
    return memory;
}

export const flatCacheCreate = (opts: FlatCacheOptions) => {
    return new FlatCache({
        ttl: 0,
        lruSize: 500,
        cacheDir: opts.cacheDir ?? configDir,
        cacheId: opts.cacheId ?? 'scrobble.cache',
        persistInterval: 1 * 1000 * 60,
        expirationInterval: 1 * 1000 * 60, // 1 minute
        ...opts
    });
}

export const flatCacheLoad = async (flatCache: FlatCache, logger: MaybeLogger): Promise<void> => {

    const cachePath = path.join(flatCache.cacheDir, flatCache.cacheId);
    try {
        fileOrDirectoryIsWriteable(cachePath);
    } catch (e) {
        throw new Error(`Unable to use path for file cache at ${cachePath}`, { cause: e })
    }

    const streamPromise = new Promise((resolve, reject) => {
        flatCache.loadFileStream(cachePath, (progress: number, total: number) => {
            logger.debug(`Loading ${progress}/${total} chunks...`);
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

export const initFileCache = async (opts: FlatCacheOptions = {}, logger: MaybeLogger = new MaybeLogger()): Promise<[Keyv | KeyvStoreAdapter | undefined, FlatCache | undefined]> => {
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
            ...typesonMarshalling
        });
        return [cache, flatCache];
    } catch (e) {
        throw e;
    }
}

export const valkeyCacheCreate = (ns: string, ...args: ConstructorParameters<typeof KeyvValkey>): Keyv => {
    const [connection, valkeyOpts = {}] = args;
    const valkey = new KeyvValkey(connection, { maxRetriesPerRequest: 5, connectTimeout: 1100, ...valkeyOpts });
    const kv = new Keyv({
        store: valkey,
        throwOnErrors: true,
        namespace: ns,
        ...typesonMarshalling
    });
    return kv;
}

export const initValkeyCache = async (ns: string, ...args: ConstructorParameters<typeof KeyvValkey>): Promise<Keyv> => {
    const kv = valkeyCacheCreate(ns, ...args);
    try {
        await kv.get('test');
        return kv;
    } catch (e) {
        throw new Error(`Unable to connect to cache ${args[0]}`, { cause: e })
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