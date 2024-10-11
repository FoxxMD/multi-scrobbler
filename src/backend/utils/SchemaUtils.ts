import * as TJS from "typescript-json-schema";
import {sync} from "glob";
import { resolve } from "path";
import { projectDir } from "../common/index.js";

// const includeOnly = [
//     sync(resolve(projectDir, "src/backend/**/*.ts"), {ignore: resolve(projectDir, "src/backend/tests/**/*")}),
//     sync(resolve(projectDir, "src/core/**/*.ts"))
// ].flat(1);

export const buildSchemaGenerator = (program?: TJS.Program, settings: TJS.PartialArgs = {}) => {
    return TJS.buildGenerator(program, {...defaultGeneratorArgs, ...settings});
}

let configProgram: TJS.Program,
generatorFromConfig: TJS.JsonSchemaGenerator;

export const getTsConfigProgram = (): TJS.Program => { 
    if(configProgram === undefined) {
        const tsConfig = resolve(projectDir, "src/backend/tsconfig.json");
        configProgram = TJS.programFromConfig(tsConfig,
            sync(resolve(projectDir, "src/backend/common/infrastructure/config/**/*.ts"))
        );
    }
    return configProgram;
}

export const getTsConfigGenerator = (): TJS.JsonSchemaGenerator => {
    if(generatorFromConfig === undefined) {
        generatorFromConfig = buildSchemaGenerator(getTsConfigProgram());
        if(generatorFromConfig === null) {
            throw new Error('Schema generator had errors! See console output.');
        }
    }
    return generatorFromConfig;
}

export const getTypeSchemaFromConfigGenerator = (type: string): TJS.Definition | null => {
    return TJS.generateSchema(getTsConfigProgram(), type, undefined, [], getTsConfigGenerator());
}

export const defaultGeneratorArgs: TJS.PartialArgs = {
    required: true,
    //ignoreErrors: true,
    titles: true,
    validationKeywords: ['deprecationMessage'],
    constAsEnum: true,
    ref: true,
    esModuleInterop: true
};
