import {createContainer} from "iti";
import path from "path";
import {projectDir} from "./common/index.js";
import ScrobbleClients from "./clients/ScrobbleClients.js";
import ScrobbleSources from "./sources/ScrobbleSources.js";
import {Notifiers} from "./notifier/Notifiers.js";
import {EventEmitter} from "events";
import {logPath} from "./common/logging.js";
import {Container} from '@foxxmd/winston';
//import ScrobbleClients from "./clients/ScrobbleClients.js";

const configDir = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
//const port = process.env.PORT ?? 9078;

/*let logPath = path.resolve(projectDir, `./logs`);
if(typeof process.env.CONFIG_DIR === 'string') {
    logPath = path.resolve(process.env.CONFIG_DIR, './logs');
}*/

let root: ReturnType<typeof createRoot>;

const createRoot = (port: number | string) => {
    return createContainer().add({
        configDir: configDir,
        logDir: logPath,
        localUrl: `http://localhost:${port}`,
        clientEmitter: () => new EventEmitter(),
        sourceEmitter: () => new EventEmitter(),
        notifierEmitter: () => new EventEmitter(),
    }).add((items) => ({
        clients: () => new ScrobbleClients(items.clientEmitter, items.sourceEmitter, items.configDir),
        sources: () => new ScrobbleSources(items.sourceEmitter, items.localUrl, items.configDir),
        notifiers: () => new Notifiers(items.notifierEmitter, items.clientEmitter, items.sourceEmitter),
    }));
}

export const getRoot = (port?: number | string) => {
    if(root === undefined) {
        root = createRoot(port);
    }
    return root;
}

export default createRoot;
