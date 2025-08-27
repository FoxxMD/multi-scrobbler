import { Cacheable, CacheableMemory, Keyv, KeyvStoreAdapter } from 'cacheable';
import { FlatCache } from 'flat-cache';
import {parse} from 'flatted';
import KeyvValkey from '@keyv/valkey';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import isToday from 'dayjs/plugin/isToday.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { childLogger, Logger } from '@foxxmd/logging';
import { projectDir } from './index.js';
import path from 'path';
import { fileOrDirectoryIsWriteable } from '../utils.js';
import { asCacheMetadataProvider, asCacheScrobbleProvider, CacheConfig, CacheConfigOptions, CacheMetadaProvider, CacheProvider } from './infrastructure/Atomic.js';

const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);

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
                provider: sProvider = (process.env.CACHE_SCROBBLE as (CacheProvider | undefined) ?? 'file'),
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
        await this.initMetadataCache();
        await this.initScrobbleCache();
    }

    protected initCacheable = async (config: CacheConfig, cacheFor: string) => {

        let logger = childLogger(this.logger, cacheFor);

        const ns = `ms-${cacheFor.toLocaleLowerCase()}`;
        
        const memoryCache = new CacheableMemory({
                ttl: '1h',
                useClone: true,
                lruSize: 200
            });
            const primaryCache = new Keyv({ store: memoryCache, namespace: ns });

            let secondaryCache: Keyv | KeyvStoreAdapter | undefined;

            if (config.provider === 'valkey') {
                logger.debug('Building valkey cache...');
                const valkey = new KeyvValkey(config.connection, {maxRetriesPerRequest: 5, connectTimeout: 1100});
                const metadataKv = new Keyv({ store: valkey, throwOnErrors: true, namespace: ns});
                try {
                    await metadataKv.get('test');
                    secondaryCache = metadataKv;
                    logger.debug('valkey cache connected');
                } catch (e) {
                    this.logger.warn(new Error(`Unable to connect to cache ${config.connection}`, { cause: e }));
                }
            } else if(config.provider === 'file') {
                logger.debug('Building file cache...');
                try {
                    fileOrDirectoryIsWriteable(config.connection);
                } catch (e) {
                    logger.warn(new Error(`Unable to use path for file cache at ${config.connection}`, {cause: e}));
                }
                const flatCache = new FlatCache({
                    ttl: 0,
                    lruSize: 500,
                    cacheDir: config.connection,
                    cacheId: 'scrobble.cache',
                    persistInterval: 1 * 1000 * 60,
                    expirationInterval: 1 * 1000 * 60, // 1 minute
                    // deserialize: (str) => {
                    //     const data = parse(str)
                    //     return data;
                    // }
                });

                let loadError: Error;

                const onlySaveError = (e: Error) => {
                    loadError = e;
                }
                flatCache.on('error', onlySaveError);
                try {
                    logger.debug('Loading cache from file...');
                    flatCache.load('scrobble.cache');
                    if(loadError !== undefined) {
                        throw loadError;
                    }
                    logger.debug('File cache loaded.');
                    flatCache.off('error', onlySaveError);
                    flatCache.on('error', (e) => {
                        logger.warn(e);
                    });
                    flatCache.on('save', () => {
                        logger.debug('Saved cache to file');
                    });
                } catch (e) {
                    logger.warn(new Error(`Unable to use file cache at ${path.join(config.connection, 'scrobble.cache')}`, {cause: e}));
                }
                secondaryCache = new Keyv({store: flatCache, throwOnErrors: true});
            }
            return new Cacheable({ primary: primaryCache, secondary: secondaryCache });

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