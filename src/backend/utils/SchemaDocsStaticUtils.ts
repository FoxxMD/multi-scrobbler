import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import { projectDir } from "../common/index.js";
import {getTypeSchemaFromConfigGenerator} from "./SchemaUtils.js";

const client = getTypeSchemaFromConfigGenerator('ClientConfig');
writeFileSync(resolve(projectDir, 'src/backend/common/schema/client.json'), JSON.stringify(client));
writeFileSync(resolve(projectDir, 'docsite/static/client.json'), JSON.stringify(client));

const source = getTypeSchemaFromConfigGenerator('SourceConfig');
writeFileSync(resolve(projectDir, 'src/backend/common/schema/source.json'), JSON.stringify(source));
writeFileSync(resolve(projectDir, 'docsite/static/source.json'), JSON.stringify(source));

const aio = getTypeSchemaFromConfigGenerator('AIOConfig');
writeFileSync(resolve(projectDir, 'src/backend/common/schema/aio.json'), JSON.stringify(aio));
writeFileSync(resolve(projectDir, 'docsite/static/aio.json'), JSON.stringify(aio));

const aio_client = getTypeSchemaFromConfigGenerator('AIOClientConfig');
writeFileSync(resolve(projectDir, 'src/backend/common/schema/aio-client.json'), JSON.stringify(aio_client));

const aio_source = getTypeSchemaFromConfigGenerator('AIOSourceConfig');
writeFileSync(resolve(projectDir, 'src/backend/common/schema/aio-source.json'), JSON.stringify(aio_source));

mkdirSync(resolve(projectDir, 'docsite/static/schemas'), {recursive: true});

const plex = getTypeSchemaFromConfigGenerator('PlexApiSourceConfig');
writeFileSync(resolve(projectDir, 'docsite/static/schemas/PlexApiSourceConfig.json'), JSON.stringify(plex));