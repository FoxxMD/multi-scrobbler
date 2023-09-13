import {createContainer} from "iti";
import path from "path";
import {projectDir} from "./common/index";
import ScrobbleClients from "./scrobblers/ScrobbleClients";
import ScrobbleSources from "./sources/ScrobbleSources";
import {Notifiers} from "./notifier/Notifiers";
import {EventEmitter} from "events";
import {logPath} from "./common/logging";
import {Container} from '@foxxmd/winston';
import { WildcardEmitter } from "./common/WildcardEmitter";

const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
//const port = process.env.PORT ?? 9078;

/*let logPath = path.resolve(projectDir, `./logs`);
if(typeof process.env.CONFIG_DIR === 'string') {
    logPath = path.resolve(process.env.CONFIG_DIR, './logs');
}*/

let root: ReturnType<typeof createRoot>;

const createRoot = (port: number | string | undefined) => {
    return createContainer().add({
        configDir: configDir,
        logDir: logPath,
        localUrl: `http://localhost:${port}`,
        isProd: process.env.NODE_ENV !== undefined && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'),
        configPort: port,
        apiPort: process.env.API_PORT ?? 9079,
        mainPort: process.env.PORT ?? 3000,
        clientEmitter: () => new WildcardEmitter(),
        sourceEmitter: () => new WildcardEmitter(),
        notifierEmitter: () => new EventEmitter(),
    }).add((items) => ({
        clients: () => new ScrobbleClients(items.clientEmitter, items.sourceEmitter, items.configDir),
        sources: () => new ScrobbleSources(items.sourceEmitter, items.localUrl, items.configDir),
        notifiers: () => new Notifiers(items.notifierEmitter, items.clientEmitter, items.sourceEmitter),
        port: () => {
            if(items.configPort !== undefined) {
                return items.configPort;
            }
            return items.isProd ? items.mainPort : items.apiPort;
        }
    }));
}

export const getRoot = (port?: number | string) => {
    if(root === undefined) {
        root = createRoot(port);
    }
    return root;
}

export default createRoot;
