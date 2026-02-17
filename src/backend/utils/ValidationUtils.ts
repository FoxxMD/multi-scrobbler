import { Logger } from "@foxxmd/logging";
import * as AjvNS from "ajv";
import Ajv, { Schema } from "ajv";
import f from "ajv-formats"
import { resolve } from "path";
import { projectDir } from "../common/index.js";

const ajvInstances: Record<string, AjvNS.Ajv> = {};

export const createAjvFactory = (logger: Logger): AjvNS.default => {
    const validator = new Ajv.default({logger: logger, verbose: true, strict: "log", strictSchema: "log", allowUnionTypes: true});
    // https://ajv.js.org/strict-mode.html#unknown-keywords
    validator.addKeyword('deprecationMessage');
    f.default(validator);
    return validator;
}
export const validateJson = async <T>(type: string, config: object, schemaIdentifier: string, logger: Logger): Promise<T> => {
    if(ajvInstances[type] === undefined) {
        ajvInstances[type] = createAjvFactory(logger);
    }
    const ajv = ajvInstances[type];

    let validate = ajv.getSchema(schemaIdentifier);
    if(validate === undefined) {
        const func = await getSchemaFunc();
        let schema;
        try {
            schema = await func(schemaIdentifier, logger);
        } catch (e) {
            logger.warn(new Error(`Could not retrieve schema for ${schemaIdentifier}, skipping validation`, {cause: e}));
            return config as unknown as T;
        }
        ajv.addSchema(schema, schemaIdentifier);
        validate = ajv.getSchema(schemaIdentifier);
    }

    const valid = validate(config);
    if (valid) {
        return config as unknown as T;
    } else {
        const schemaErrors = ['Json config was not valid. Please use schema to check validity.'];
        if (Array.isArray(validate.errors)) {
            for (const err of validate.errors) {
                const parts = [
                    `At: ${err.instancePath}`,
                ];
                let data;
                if (typeof err.data === 'string') {
                    data = err.data;
                } else if (err.data !== null && typeof err.data === 'object' && (err.data as any).name !== undefined) {
                    data = `Object named '${(err.data as any).name}'`;
                }
                if (data !== undefined) {
                    parts.push(`Data: ${data}`);
                }
                let suffix = '';
                if (err.params.allowedValues !== undefined) {
                    suffix = err.params.allowedValues.join(', ');
                    suffix = ` [${suffix}]`;
                }
                parts.push(`${err.keyword}: ${err.schemaPath} => ${err.message}${suffix}`);

                // if we have a reference in the description parse it out so we can log it here for context
                if (err.parentSchema !== undefined && err.parentSchema.description !== undefined) {
                    const desc = err.parentSchema.description as string;
                    const seeIndex = desc.indexOf('[See]');
                    if (seeIndex !== -1) {
                        let newLineIndex: number | undefined = desc.indexOf('\n', seeIndex);
                        if (newLineIndex === -1) {
                            newLineIndex = undefined;
                        }
                        const seeFragment = desc.slice(seeIndex + 5, newLineIndex);
                        parts.push(`See:${seeFragment}`);
                    }
                }

                schemaErrors.push(`Schema Error:\r\n${parts.join('\r\n')}`);
            }
        }
        throw new Error(schemaErrors.join('\n\n'));
    }
}

let schemaFetchFunc;

const compiledPath = 'src/backend/utils/SchemaCompiledUtils.js',
dynamicPath = 'src/backend/utils/SchemaUtils.js';

const getSchemaFunc = async () => {
    if(schemaFetchFunc !== undefined) {
        return schemaFetchFunc;
    }
    const useCompiled = process.env.NODE_ENV === 'production' || process.env.COMPILED_VALIDATION === 'true';
    const schemaFuncPath = resolve(projectDir, useCompiled ? compiledPath : dynamicPath);
    try {
        const module = await import(resolve(projectDir, schemaFuncPath))
        schemaFetchFunc = module.getSchemaForType;
    } catch (e) {
        throw new Error(`Could not load module from path: ${schemaFuncPath}`);
    }
    return schemaFetchFunc;
}

