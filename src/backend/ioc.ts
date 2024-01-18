import {createContainer} from "iti";
import path from "path";
import { configDir, projectDir } from "./common/index.js";
import ScrobbleClients from "./scrobblers/ScrobbleClients.js";
import ScrobbleSources from "./sources/ScrobbleSources.js";
import { Notifiers } from "./notifier/Notifiers.js";
import {EventEmitter} from "events";
import { logPath } from "./common/logging.js";
import { WildcardEmitter } from "./common/WildcardEmitter.js";
import normalizeUrl from 'normalize-url';
import fs from 'fs';

let version = 'unknown';

if(process.env.VERSION === undefined) {
    if(fs.existsSync('./package.json')) {
        try {
            const pkg = fs.readFileSync('./package.json') as unknown as string;
            try {
                version = JSON.parse(pkg).version || 'unknown'
            } catch (e) {
                // don't care
            }
        } catch (e) {
            // don't care
        }
    } else if(fs.existsSync('./package-lock.json')) {
        try {
            const pkg = fs.readFileSync('./package-lock.json') as unknown as string;
            try {
                version = JSON.parse(pkg).version || 'unknown'
            } catch (e) {
                // don't care
            }
        } catch (e) {
            // don't care
        }
    }
} else {
    version = process.env.VERSION;
}

let root: ReturnType<typeof createRoot>;

export interface RootOptions {
    baseUrl?: string,
    port?: string | number
}

const createRoot = (options?: RootOptions) => {
    const {
        port = 9078,
        baseUrl = process.env.BASE_URL,
    } = options || {};
    const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
    return createContainer().add({
        version,
        configDir: configDir,
        logDir: logPath,
        isProd: process.env.NODE_ENV !== undefined && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'),
        port: process.env.PORT ?? port,
        clientEmitter: () => new WildcardEmitter(),
        sourceEmitter: () => new WildcardEmitter(),
        notifierEmitter: () => new EventEmitter(),
    }).add((items) => {
        const base = normalizeUrl(baseUrl ?? 'http://localhost', {removeSingleSlash: true});
        const u = new URL(base);
        let localUrl = u.toString();
        if(u.port === '' && u.pathname === '/') {
            localUrl = `${u.origin}:${items.mainPort}`;
        }
        return {
            clients: () => new ScrobbleClients(items.clientEmitter, items.sourceEmitter, localUrl, items.configDir),
            sources: () => new ScrobbleSources(items.sourceEmitter, localUrl, items.configDir),
            notifiers: () => new Notifiers(items.notifierEmitter, items.clientEmitter, items.sourceEmitter),
            localUrl,
            hasDefinedBaseUrl: baseUrl !== undefined
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
