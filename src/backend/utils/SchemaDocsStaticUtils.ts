import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import * as z from 'zod';
import { clientConfigSchemaMap } from '../common/infrastructure/config/client/clients.ts';
import { sourceConfigSchemaMap } from '../common/infrastructure/config/source/sources.ts';
import { projectRootDir } from "../common/infrastructure/Atomic.ts";
import { aioConfigSchema } from "../common/infrastructure/config/aioConfig.ts";

mkdirSync(resolve(projectRootDir, 'docsite/static/schemas'), {recursive: true});

const generateSchema = (schema: z.ZodType, reused: z.core.ToJSONSchemaParams['reused'] = 'inline') => z.toJSONSchema(schema, { 
    io: "input",
    reused,
    target: "draft-07",
    unrepresentable: "any",
    override: (ctx) => {
        if(ctx.jsonSchema.anyOf !== undefined && Array.isArray(ctx.jsonSchema.anyOf)) {
            for(const a of ctx.jsonSchema.anyOf) {
                if(a.const !== undefined) {
                    a.enum = [a.const];
                    delete a.const;
                }
            }
            //return;
        }
        if(ctx.jsonSchema.oneOf !== undefined) {
            for(const a of ctx.jsonSchema.oneOf) {
                if(a.const !== undefined) {
                    a.enum = [a.const];
                    delete a.const;
                }
            }
            //return;
        }
        if(ctx.jsonSchema.const !== undefined) {
            ctx.jsonSchema.enum = [ctx.jsonSchema.const];
            delete ctx.jsonSchema.const;
            return
        }
    }
 })

const clientEntries = Object.entries(clientConfigSchemaMap);
for(const [k,v] of clientEntries) {
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${k}-client.json`), JSON.stringify(generateSchema(z.array(v))));
}

const sourcesEntries = Object.entries(sourceConfigSchemaMap);
for(const [k,v] of sourcesEntries) {
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${k}-source.json`), JSON.stringify(generateSchema(z.array(v[0]))));
}

writeFileSync(resolve(projectRootDir, 'docsite/static/schemas/aio.json'), JSON.stringify(generateSchema(aioConfigSchema, 'ref')));
