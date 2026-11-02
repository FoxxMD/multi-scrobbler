import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer, type ServerOptions } from '../../server/index.ts';

const internalConfig = { localUrl: new URL('http://localhost:9078'), configDir: 'fake', logger: loggerTest, version: 'test' };

/** Build a test-mode server app. Auth instance, settings and db are available on app.locals (ServerLocals) */
export const buildAuthApp = async (opts: ServerOptions = {}, setup?: (sources: ScrobbleSources) => Promise<void>) => {
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    if (setup !== undefined) {
        await setup(sources);
    }
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const [app] = await initServer({ sources, clients }, { testMode: true, ...opts });
    return app;
};
