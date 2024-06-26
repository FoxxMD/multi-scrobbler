import { Logger } from "@foxxmd/logging";
import { EventEmitter } from "events";
import fs from 'fs';
import git, { Commit } from "git-last-commit";
import { createContainer } from "iti";
import path from "path";
import { projectDir } from "./common/index.js";
import { WildcardEmitter } from "./common/WildcardEmitter.js";
import { Notifiers } from "./notifier/Notifiers.js";
import ScrobbleClients from "./scrobblers/ScrobbleClients.js";
import ScrobbleSources from "./sources/ScrobbleSources.js";
import { generateBaseURL } from "./utils.js";

let version: string;
let packageVersion: string | undefined = undefined;
let envVersion: string | undefined = process.env.APP_VERSION;
if(envVersion !== undefined && envVersion.trim() === '') {
    envVersion = undefined;
}
let gitVersion: string | undefined = undefined;

try {
    if (fs.existsSync('./package.json')) {
        try {
            const pkg = fs.readFileSync('./package.json') as unknown as string;
            try {
                packageVersion = JSON.parse(pkg).version || 'unknown'
            } catch (e) {
                // don't care
            }
        } catch (e) {
            // don't care
        }
    } else if (fs.existsSync('./package-lock.json')) {
        try {
            const pkg = fs.readFileSync('./package-lock.json') as unknown as string;
            try {
                packageVersion = JSON.parse(pkg).version || 'unknown'
            } catch (e) {
                // don't care
            }
        } catch (e) {
            // don't care
        }
    }
} catch (e) {
    // swallow!
}

export const parseGitVersion = async (logger?: Logger): Promise<[Commit, string] | undefined> => {
    try {
        const gitInfo = await new Promise((resolve, reject) => {
            git.getLastCommit((err, commit) => {
                if(err) {
                    reject(err);
                }
                // read commit object properties
                resolve(commit);
            });
        }) as Commit;
        const parts = [];
        if(gitInfo.tags.length > 0) {
            parts.push(gitInfo.tags[0]);
        } else {
            if(gitInfo.branch !== undefined) {
                parts.push(gitInfo.branch);
            }
            parts.push(gitInfo.shortHash);
        }
        gitVersion = parts.join('-');
        return [gitInfo, gitVersion];
    } catch (e) {
        if(process.env.DEBUG_MODE === "true") {
            logger.debug(new Error('Could not get git info, continuing...', {cause: e}));
        }
        return undefined;
    }
}

let root: ReturnType<typeof createRoot>;

export interface RootOptions {
    baseUrl?: string,
    port?: string | number
    logger: Logger
    disableWeb?: boolean
}

const createRoot = (options?: RootOptions) => {
    const {
        port = 9078,
        baseUrl = process.env.BASE_URL,
        disableWeb: dw
    } = options || {};
    const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
    let disableWeb = dw;
    if(disableWeb === undefined) {
        disableWeb = process.env.DISABLE_WEB === 'true';
    }

    if(envVersion !== undefined) {
        version = envVersion;
    } else if(gitVersion !== undefined) {
        version = gitVersion;
    } else if(packageVersion !== undefined) {
        version = packageVersion;
    } else {
        version = 'Unknown';
    }

    return createContainer().add({
        version,
        configDir: configDir,
        isProd: process.env.NODE_ENV !== undefined && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'),
        port: process.env.PORT ?? port,
        disableWeb,
        clientEmitter: () => new WildcardEmitter(),
        sourceEmitter: () => new WildcardEmitter(),
        notifierEmitter: () => new EventEmitter(),
    }).add((items) => {
        const localUrl = generateBaseURL(baseUrl, items.port)
        return {
            clients: () => new ScrobbleClients(items.clientEmitter, items.sourceEmitter, localUrl, items.configDir, options.logger),
            sources: () => new ScrobbleSources(items.sourceEmitter, localUrl, items.configDir, options.logger),
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
