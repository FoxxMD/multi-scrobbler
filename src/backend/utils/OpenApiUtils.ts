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
import { getRoot } from "../ioc.ts";
import { getMigratedDb } from "../common/database/appMigrator.ts";
import { MEMORY_DB_NAME } from "../common/database/Database.ts";
import { SECURITY_SCHEMES } from "../server/requireAuth.ts";

const description = stripIndents`
The Multi-Scrobbler server API is documented in **OpenAPI format** and includes
endpoints useful for programatically interacting with your \`Play\` data and the various **Sources**/**Clients**
you have configured.

Additionally, the **Ingress** category endpoints document the body/query shape required to make a successful api call for [Ingress-based Sources.](/configuration/sources/?sourceComm=ingress#by-communication-method)

:::tip

If you not using Ingress-based Sources or trying to write an application to use the MS API, you do not
not need to use this docs section.

:::

:::important

The endpoints documented here, other than those in Ingress categories, are **subject to change until a release declares them stable.**

:::

`

export const getOpenApiDoc = async () => {
    // server setup (auth) needs a database, an in-memory one is enough to build the spec
    getRoot({logger: loggerTest, db: async () => (await getMigratedDb(MEMORY_DB_NAME))[0]});
    const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' };
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);

    const [app, router] = await initServer({sources, clients}, {testMode: true});
    const spec = await generateOpenApiSpec(router, {
        title: 'Multi-Scrobbler API',
        version: '0.1.0',
        description: description,
        securitySchemes: SECURITY_SCHEMES,
    });
    return spec;
}

export const writeOpenApiDoc = async () => {
    const spec = await getOpenApiDoc();
    writeFileSync(resolve(projectRootDir, 'docsite/public/openapi.json'), JSON.stringify(spec));
}

await writeOpenApiDoc();