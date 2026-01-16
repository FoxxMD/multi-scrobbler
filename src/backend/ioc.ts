import { getVersion } from "@foxxmd/get-version";
import { Logger, loggerDebug, LogOptions } from "@foxxmd/logging";
import { EventEmitter } from "events";
import { createContainer } from "iti";
import path from "path";
import { projectDir } from "./common/index.js";
import { WildcardEmitter } from "./common/WildcardEmitter.js";

import { generateBaseURL } from "./utils/NetworkUtils.js";
import { PassThrough } from "stream";
import { CacheConfigOptions, MusicBrainzSingletonMap } from "./common/infrastructure/Atomic.js";
import { MSCache } from "./common/Cache.js";
import TransformerManager from "./common/transforms/TransformerManager.js";
import { TransformerCommonConfig } from "../core/Atomic.js";
import prom, { Counter, Gauge } from 'prom-client';

export let version: string = 'unknown';

export const parseVersion = async () => {
    version = await getVersion({priority: ['env', 'git', 'file']});
    return version;
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
    mbMap?: MusicBrainzSingletonMap | (() => MusicBrainzSingletonMap)
    transformers?: TransformerCommonConfig[]
}

const discovered = new prom.Counter({
            name: 'multiscrobbler_source_discovered',
            help: 'Number of discovered plays for a Source',
            labelNames: ['name']
});

// const sourceIssues = new prom.Gauge({
//             name: 'multiscrobbler_source_issues',
//             help: 'Number of errors/issues with Source',
//             labelNames: ['name']
// });

const queuedGauge = new prom.Gauge({
            name: 'multiscrobbler_client_queued',
            help: 'Number of queued plays for a Client',
            labelNames: ['name']
        });
const deadLetterGauge = new prom.Gauge({
            name: 'multiscrobbler_client_deadletter',
            help: 'Number of deadletter plays for a Client',
            labelNames: ['name']
});
// const issuesClientGauge = new prom.Gauge({
//             name: 'multiscrobbler_client_issues',
//             help: 'Number of errors/issues with Client',
//             labelNames: ['name']
// });
const scrobbledCounter = new prom.Counter({
            name: 'multiscrobbler_client_scrobbled',
            help: 'Number of discovered plays for a Source',
            labelNames: ['name']
});

const createRoot = (options: RootOptions = {logger: loggerDebug}) => {
    const {
        port = 9078,
        baseUrl = process.env.BASE_URL,
        disableWeb: dw,
        loggerStream,
        loggingConfig,
        logger,
        cache,
        mbMap,
        transformers = [],
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

    let mbFunc: () => MusicBrainzSingletonMap;
    let maybeSingletonMb: MusicBrainzSingletonMap;
    if(typeof mbMap === 'function') {
        mbFunc = mbMap;
    } else if(maybeSingletonMb !== undefined) {
        maybeSingletonMb = mbMap;
    } else {
        maybeSingletonMb = new Map();
    }


    const cEmitter = new WildcardEmitter();
    // do nothing, just catch
    cEmitter.on('error', (e) => null);
    const sEmitter = new WildcardEmitter();
    sEmitter.on('error', (e) => {
        const f = e;
    });

    const transformerManager = new TransformerManager(logger, maybeSingletonCache !== undefined ? maybeSingletonCache : cacheFunc());
    for(const c of transformers) {
        try {
            transformerManager.register(c);
        } catch (e) {
            logger.warn(new Error('Could not register a transformer', {cause: e}));
        }
    }
    if(transformers.length === 0) {
        logger.debug('No user-supplied transformer configs were found.');
    }
    if(!transformerManager.hasTransformerType('user')) {
        transformerManager.register({type: 'user', name: 'MSDefault'});
    }
    if(!transformerManager.hasTransformerType('native')) {
        transformerManager.register({type: 'native', name: 'MSDefault'});
    }

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
        sourceMetics: {
            discovered: discovered,
            //issues: sourceIssues
        },
        clientMetrics: {
            queued: queuedGauge,
            scrobbled: scrobbledCounter,
            //issues: issuesClientGauge,
            deadLetter: deadLetterGauge
        },
        logger: logger,
        transformerManager,
        cache: () => maybeSingletonCache !== undefined ? () => maybeSingletonCache : cacheFunc,
        mbMap: () => maybeSingletonMb !== undefined ? () => maybeSingletonMb : mbFunc
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
