import { loggerTest } from "@foxxmd/logging";
import { initServer } from "../server/index.ts";
import ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import { WildcardEmitter } from "../common/WildcardEmitter.ts";
import ScrobbleSources from "../sources/ScrobbleSources.ts";
import { generateOpenApiSpec } from "@minisylar/express-typed-router";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import { projectRootDir } from "../common/infrastructure/Atomic.ts";

export const getOpenApiDoc = async () => {
    const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);

    const [app, router] = await initServer({sources, clients}, {testMode: true});
    const spec = await generateOpenApiSpec(router, {title: 'Multi-Scrobbler API', version: '0.1.0'});
    return spec;
}

export const writeOpenApiDoc = async () => {
    const spec = await getOpenApiDoc();
    writeFileSync(resolve(projectRootDir, 'docsite/static/openapi.json'), JSON.stringify(spec));
}

await writeOpenApiDoc();