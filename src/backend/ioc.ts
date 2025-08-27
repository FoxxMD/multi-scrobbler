import { getVersion } from "@foxxmd/get-version";
import { Logger, loggerDebug, LogOptions } from "@foxxmd/logging";
import { EventEmitter } from "events";
import { createContainer } from "iti";
import path from "path";
import { projectDir } from "./common/index.js";
import { WildcardEmitter } from "./common/WildcardEmitter.js";

import { generateBaseURL } from "./utils/NetworkUtils.js";
import { PassThrough } from "stream";
import { CacheConfigOptions } from "./common/infrastructure/Atomic.js";
import { MSCache } from "./common/Cache.js";

export let version: string = 'unknown';

export const parseVersion = async () => {
    version = await getVersion({priority: ['env', 'git', 'file']});
}

let root: ReturnType<typeof createRoot>;

export interface RootOptions {
    baseUrl?: string,
    port?: number
    logger: Logger
    disableWeb?: boolean
    loggerStream?: PassThrough
    loggingConfig?: LogOptions
    cache?: CacheConfigOptions | MSCache | (() => MSCache)
}

const createRoot = (options: RootOptions = {logger: loggerDebug}) => {
    const {
        port = 9078,
        baseUrl = process.env.BASE_URL,
        disableWeb: dw,
        loggerStream,
        loggingConfig,
        logger,
        cache
    } = options || {};
    const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
    let disableWeb = dw;
    if(disableWeb === undefined) {
        disableWeb = process.env.DISABLE_WEB === 'true';
    }

    let cacheFunc: () => MSCache;
    let maybeSingletonCache: MSCache;

    if(cache instanceof MSCache) {
        maybeSingletonCache = cache;
    } else if(typeof cache === 'function') {
        cacheFunc = cache;
    } else {
        maybeSingletonCache = new MSCache(logger, cache);
    }


    const cEmitter = new WildcardEmitter();
    // do nothing, just catch
    cEmitter.on('error', (e) => null);
    const sEmitter = new WildcardEmitter();
    sEmitter.on('error', (e) => {
        const f = e;
    });

    const portVal: number | string = process.env.PORT ?? port;

    return createContainer().add({
        version,
        configDir: configDir,
        isProd: process.env.NODE_ENV !== undefined && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'),
        // @ts-ignore
        port: (Number.isInteger(portVal) ? portVal : Number.parseInt(portVal)) as number,
        disableWeb,
        clientEmitter: () => cEmitter,
        sourceEmitter: () => sEmitter,
        notifierEmitter: () => new EventEmitter(),
        loggerStream,
        loggingConfig,
        logger: logger,
        cache: () => maybeSingletonCache !== undefined ? () => maybeSingletonCache : cacheFunc
    }).add((items) => {
        const localUrl = generateBaseURL(baseUrl, items.port)
        return {
            localUrl,
            hasDefinedBaseUrl: baseUrl !== undefined,
            isSubPath: localUrl.pathname !== '/' && localUrl.pathname.length > 0
        }
    });
}

export const getRoot = (options?: RootOptions) => {
    if(root === undefined) {
        root = createRoot(options);
    }
    return root;
}

export default createRoot;
