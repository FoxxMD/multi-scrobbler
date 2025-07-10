import { getVersion } from "@foxxmd/get-version";
import { Logger, LogOptions } from "@foxxmd/logging";
import { EventEmitter } from "events";
import { createContainer } from "iti";
import path from "path";
import { projectDir } from "./common/index.js";
import { WildcardEmitter } from "./common/WildcardEmitter.js";
import { Notifiers } from "./notifier/Notifiers.js";
import ScrobbleClients from "./scrobblers/ScrobbleClients.js";
import ScrobbleSources from "./sources/ScrobbleSources.js";

import { generateBaseURL } from "./utils/NetworkUtils.js";
import { PassThrough } from "stream";

export let version: string = 'unknown';

export const parseVersion = async () => {
    version = await getVersion({priority: ['env', 'git', 'file']});
}

let root: ReturnType<typeof createRoot>;

export interface RootOptions {
    baseUrl?: string,
    port?: string | number
    logger: Logger
    disableWeb?: boolean
    loggerStream?: PassThrough
    loggingConfig?: LogOptions
}

const createRoot = (options?: RootOptions) => {
    const {
        port = 9078,
        baseUrl = process.env.BASE_URL,
        disableWeb: dw,
        loggerStream,
        loggingConfig
    } = options || {};
    const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
    let disableWeb = dw;
    if(disableWeb === undefined) {
        disableWeb = process.env.DISABLE_WEB === 'true';
    }

    const cEmitter = new WildcardEmitter();
    // do nothing, just catch
    cEmitter.on('error', (e) => null);
    const sEmitter = new WildcardEmitter();
    sEmitter.on('error', (e) => {
        const f = e;
    });

    return createContainer().add({
        version,
        configDir: configDir,
        isProd: process.env.NODE_ENV !== undefined && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'),
        port: process.env.PORT ?? port,
        disableWeb,
        clientEmitter: () => cEmitter,
        sourceEmitter: () => sEmitter,
        notifierEmitter: () => new EventEmitter(),
        loggerStream,
        loggingConfig,
    }).add((items) => {
        const localUrl = generateBaseURL(baseUrl, items.port)
        return {
            clients: () => new ScrobbleClients(items.clientEmitter, items.sourceEmitter, localUrl, items.configDir, options.logger),
            sources: () => new ScrobbleSources(items.sourceEmitter, { localUrl, configDir: items.configDir, version }, options.logger),
            notifiers: () => new Notifiers(items.notifierEmitter, items.clientEmitter, items.sourceEmitter, options.logger),
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
