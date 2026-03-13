import { writeFileSync } from "node:fs";
import { resolve } from "path";
import { projectDir } from "../common/index.js";
import {getTypeSchemaFromConfigGenerator} from "./SchemaUtils.js";
import { clientInterfaces } from '../common/infrastructure/config/client/clients.js';
import { sourceInterfaces } from '../common/infrastructure/config/source/sources.js';

for(const inter of sourceInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(inter);
    writeFileSync(resolve(projectDir, `src/backend/common/schema/${inter}.json`), JSON.stringify(schema));
}

for(const inter of clientInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(inter);
    writeFileSync(resolve(projectDir, `src/backend/common/schema/${inter}.json`), JSON.stringify(schema));
}