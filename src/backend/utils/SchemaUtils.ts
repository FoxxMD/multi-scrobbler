import { resolve } from "path";
import { projectDir } from "../common/index.js";
import {
    Definition as TSJDefinition,
    createFormatter,
    CompletedConfig as TSJCompletedConfig,
    DEFAULT_CONFIG,
    createProgram,
    createParser,
    SchemaGenerator, LiteralType, LiteralTypeFormatter
} from "ts-json-schema-generator";
import { MaybeLogger } from "../common/logging.js";

// https://github.com/vega/ts-json-schema-generator/issues/1899#issuecomment-2407674526
// https://github.com/vega/ts-json-schema-generator?tab=readme-ov-file#custom-formatting
class CustomLiteralTypeFormatter extends LiteralTypeFormatter {
    public getDefinition(type: LiteralType): TSJDefinition {
        const result = super.getDefinition(type);

        if ("const" in result && result.const) {
            return { type: result.type, enum: [result.const] };
        }

        return result;
    }
}


const tsjConfig: TSJCompletedConfig = {
    ...DEFAULT_CONFIG,
    sortProps: false,
    additionalProperties: true,
    markdownDescription: true,
    minify: false,
    topRef: false,
    path: resolve(projectDir, "src/backend/common/infrastructure/config/aioConfig.ts"),
    tsconfig: resolve(projectDir, "src/backend/tsconfig.json"),
};

const formatter = createFormatter(tsjConfig, (fmt, circularReferenceTypeFormatter) => {
    fmt.addTypeFormatter(new CustomLiteralTypeFormatter());
});

let vegaGenerator: SchemaGenerator;

export const createVegaGenerator = (logger: MaybeLogger = new MaybeLogger()) => {
    if(vegaGenerator === undefined) {
        logger.info('Generating schema definitions...');
        const program = createProgram(tsjConfig);
        const parser = createParser(program, tsjConfig);
        vegaGenerator = new SchemaGenerator(program, parser, formatter, tsjConfig);
        logger.info('Schema definitions generated');
    }
    return vegaGenerator;
}

export const getTypeSchemaFromConfigGenerator = (type: string, logger: MaybeLogger = new MaybeLogger()): any => {
    const generator = createVegaGenerator(logger);
    const schema = generator.createSchema(type)
    return schema;
}

export const getSchemaForType = (type: string, logger: MaybeLogger = new MaybeLogger()): any => {
    return getTypeSchemaFromConfigGenerator(type, logger);
}