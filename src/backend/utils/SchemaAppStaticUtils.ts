import { writeFileSync } from "node:fs";
import { resolve } from "path";
import {getTypeSchemaFromConfigGenerator} from "./SchemaUtils.ts";
import { clientInterfaces } from '../common/infrastructure/config/client/clients.ts';
import { sourceInterfaces } from '../common/infrastructure/config/source/sources.ts';
import { projectRootDir } from "../../core/Atomic.ts";

for(const inter of sourceInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(inter);
    writeFileSync(resolve(projectRootDir, `src/backend/common/schema/${inter}.json`), JSON.stringify(schema));
}

for(const inter of clientInterfaces) {
    const schema = getTypeSchemaFromConfigGenerator(inter);
    writeFileSync(resolve(projectRootDir, `src/backend/common/schema/${inter}.json`), JSON.stringify(schema));
}