import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import {getTypeSchemaFromConfigGenerator} from "./SchemaUtils.ts";
import { atomicClientInterfaces } from '../common/infrastructure/config/client/clients.ts';
import { atomicSourceInterfaces } from '../common/infrastructure/config/source/sources.ts';
import { projectRootDir } from "../common/infrastructure/Atomic.ts";

mkdirSync(resolve(projectRootDir, 'docsite/static/schemas'), {recursive: true});

const aio = getTypeSchemaFromConfigGenerator('AIOConfig');
writeFileSync(resolve(projectRootDir, 'docsite/static/schemas/aio.json'), JSON.stringify(aio));

for(const inter of atomicSourceInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(`${inter}s`);
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${inter}.json`), JSON.stringify(schema));
}

for(const inter of atomicClientInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(`${inter}s`);
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${inter}.json`), JSON.stringify(schema));
}