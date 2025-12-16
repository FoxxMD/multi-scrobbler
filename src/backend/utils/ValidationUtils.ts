import { Logger } from "@foxxmd/logging";
import * as AjvNS from "ajv";
import Ajv, { Schema } from "ajv";
import f from "ajv-formats"

export const createAjvFactory = (logger: Logger): AjvNS.default => {
    const validator = new Ajv.default({logger: logger, verbose: true, strict: "log", strictSchema: "log", allowUnionTypes: true});
    // https://ajv.js.org/strict-mode.html#unknown-keywords
    validator.addKeyword('deprecationMessage');
    f.default(validator);
    return validator;
}
export const validateJson = <T>(config: object, schema: Schema, logger: Logger): T => {
    const ajv = createAjvFactory(logger);
    if(schema === null) {
        throw new Error('Schema cannot be null');
    }
    const valid = ajv.validate(schema, config);
    if (valid) {
        return config as unknown as T;
    } else {
        const schemaErrors = ['Json config was not valid. Please use schema to check validity.'];
        if (Array.isArray(ajv.errors)) {
            for (const err of ajv.errors) {
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
