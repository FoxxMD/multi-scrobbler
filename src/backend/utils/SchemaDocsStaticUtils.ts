import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import * as z from 'zod';
import { clientConfigSchemaMap } from '../common/infrastructure/config/client/clients.ts';
import { sourceConfigSchemaMap } from '../common/infrastructure/config/source/sources.ts';
import { projectRootDir } from "../common/infrastructure/Atomic.ts";
import { aioConfigSchema } from "../common/infrastructure/config/aioConfig.ts";
import { envSchemas } from "../common/infrastructure/config/client/maloja.ts";
import { generateCommonComponentEnvConfigSchema } from "../common/infrastructure/config/common.ts";
import { zodObjectToTableColumns } from "./ZodUtils.ts";
import {markdownTable} from 'markdown-table'

mkdirSync(resolve(projectRootDir, 'docsite/static/schemas'), {recursive: true});

const common = generateCommonComponentEnvConfigSchema('MALOJA');
const schema = z.object({
    ...common.shape,
    ...envSchemas.data.shape
});
const col = zodObjectToTableColumns(schema, 'out');

const mdCols: string[][] = col.map((x) => {
    const name = `\`${x.title}\``;
    return [
        x.required ? `**${name}**` : name,
        x.type,
        (x.default ?? '').toString(),
        x.description ?? ''
    ]
});
const tableContent = markdownTable([
    ['Environmental Variable', 'Type', 'Default', 'Description'],
    ...mdCols
]);

writeFileSync(resolve(projectRootDir, `docsite/static/schemas/maloja-env-test.md`), tableContent);

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
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${k}-client.json`), JSON.stringify(generateSchema(z.array(v[0]))));
}

const sourcesEntries = Object.entries(sourceConfigSchemaMap);
for(const [k,v] of sourcesEntries) {
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${k}-source.json`), JSON.stringify(generateSchema(z.array(v[0]))));
}

writeFileSync(resolve(projectRootDir, 'docsite/static/schemas/aio.json'), JSON.stringify(generateSchema(aioConfigSchema, 'ref')));
