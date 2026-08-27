import { loggerTest } from "@foxxmd/logging";
import { initServer } from "../server/index.ts";
import ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import { WildcardEmitter } from "../common/WildcardEmitter.ts";
import ScrobbleSources from "../sources/ScrobbleSources.ts";
import { generateOpenApiSpec } from "@minisylar/express-typed-router";
import { writeFileSync } from "node:fs";
import { resolve } from "path";
import { projectRootDir } from "../common/infrastructure/Atomic.ts";
import { stripIndents } from "common-tags";

const description = stripIndents`
The Multi-Scrobbler server API is documented in **OpenAPI format** and includes
endpoints useful for programatically interacting with your \`Play\` data and the various **Sources**/**Clients**
you have configured.

Additionally, the **Ingress** category endpoints document the body/query shape required to make a successful api call for [Ingress-based Sources.](/configuration/sources/?sourceComm=ingress#by-communication-method)

**Note:** If you not using Ingress-based Sources or trying to write an application to use the MS API, you do not
not need to use this docs section.
`

export const getOpenApiDoc = async () => {
    const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);

    const [app, router] = await initServer({sources, clients}, {testMode: true});
    const spec = await generateOpenApiSpec(router, {
        title: 'Multi-Scrobbler API',
        version: '0.1.0',
        description: description
    });
    return spec;
}

export const writeOpenApiDoc = async () => {
    const spec = await getOpenApiDoc();
    writeFileSync(resolve(projectRootDir, 'docsite/static/openapi.json'), JSON.stringify(spec));
}

await writeOpenApiDoc();