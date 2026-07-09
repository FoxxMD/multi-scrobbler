import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import { projectDir } from "../common/index.ts";
import {getTypeSchemaFromConfigGenerator} from "./SchemaUtils.ts";
import { atomicClientInterfaces } from '../common/infrastructure/config/client/clients.ts';
import { atomicSourceInterfaces } from '../common/infrastructure/config/source/sources.ts';

mkdirSync(resolve(projectDir, 'docsite/static/schemas'), {recursive: true});

const aio = getTypeSchemaFromConfigGenerator('AIOConfig');
writeFileSync(resolve(projectDir, 'docsite/static/schemas/aio.json'), JSON.stringify(aio));

for(const inter of atomicSourceInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(`${inter}s`);
    writeFileSync(resolve(projectDir, `docsite/static/schemas/${inter}.json`), JSON.stringify(schema));
}

for(const inter of atomicClientInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(`${inter}s`);
    writeFileSync(resolve(projectDir, `docsite/static/schemas/${inter}.json`), JSON.stringify(schema));
}