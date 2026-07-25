import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import * as z from 'zod';
import {getTypeSchemaFromConfigGenerator} from "./SchemaUtils.ts";
import { atomicClientInterfaces } from '../common/infrastructure/config/client/clients.ts';
import { atomicSourceInterfaces } from '../common/infrastructure/config/source/sources.ts';
import { projectRootDir } from "../common/infrastructure/Atomic.ts";
import { koitoClientConfigSchema } from "../common/infrastructure/config/client/koito.ts";

mkdirSync(resolve(projectRootDir, 'docsite/static/schemas'), {recursive: true});

const jsonSchema = z.toJSONSchema(koitoClientConfigSchema, { 
    io: "input",
    //reused: "ref",
    unrepresentable: "any",
    override: (ctx) => {
        //const def = ctx.zodSchema._zod.def;
        if(ctx.jsonSchema.anyOf !== undefined && Array.isArray(ctx.jsonSchema.anyOf)) {
            for(const a of ctx.jsonSchema.anyOf) {
                if(a.const !== undefined) {
                    a.enum = [a.const];
                    delete a.const;
                }
            }
        }
        if(ctx.jsonSchema.oneOf !== undefined) {
            for(const a of ctx.jsonSchema.oneOf) {
                if(a.const !== undefined) {
                    a.enum = [a.const];
                    delete a.const;
                }
            }
        }
        if(ctx.jsonSchema.const !== undefined) {
            ctx.jsonSchema.enum = [ctx.jsonSchema.const];
            delete ctx.jsonSchema.const;
        }
        // if (ctx.jsonSchema.anyOf) {
        //     ctx.jsonSchema.oneOf = ctx.jsonSchema.anyOf;
        //     delete ctx.jsonSchema.anyOf;
        // }
    }
 });
writeFileSync(resolve(projectRootDir, `docsite/static/schemas/KoitoClientConfig.json`), JSON.stringify(jsonSchema));

// const aio = getTypeSchemaFromConfigGenerator('AIOConfig');
// writeFileSync(resolve(projectRootDir, 'docsite/static/schemas/aio.json'), JSON.stringify(aio));

// for(const inter of atomicSourceInterfaces) {
//     const schema = getTypeSchemaFromConfigGenerator(`${inter}s`);
//     writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${inter}.json`), JSON.stringify(schema));
// }

// for(const inter of atomicClientInterfaces) {
//     const schema = getTypeSchemaFromConfigGenerator(`${inter}s`);
//     writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${inter}.json`), JSON.stringify(schema));
// }