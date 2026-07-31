import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "path";
import * as z from 'zod';
import { clientConfigSchemaMapAsync } from '../common/infrastructure/config/client/clientsMap.ts';
import { projectRootDir } from "../common/infrastructure/Atomic.ts";
import { aioConfigSchema } from "../common/infrastructure/config/aioConfig.ts";
import { generateCommonComponentEnvConfigSchema } from "../common/infrastructure/config/common.ts";
import { zodObjectToTableColumns, type TableColumn } from "./ZodUtils.ts";
import {markdownTable} from 'markdown-table'
import { sourceAIOConfigSchema } from "../common/infrastructure/config/source/sources.ts";
import { sourceConfigSchemaMapAsync } from "../common/infrastructure/config/source/sourcesMap.ts";

mkdirSync(resolve(projectRootDir, 'docsite/static/schemas'), {recursive: true});

const mdCols =  (cols: TableColumn[]): string[][] => cols.map((x) => {
    const name = `\`${x.title}\``;
    return [
        x.required ? `_**${name}**_` : name,
        x.type,
        (x.default ?? '').toString(),
        x.description ?? ''
    ]
})

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

const clientEntries = Object.entries(clientConfigSchemaMapAsync);
for(const [k,v] of clientEntries) {
    const [fileSchema, aioSchema, envSchemas] = await v();
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${k}-client.json`), JSON.stringify(generateSchema(z.array(fileSchema))));

    const envSchema = envSchemas;
    const common = generateCommonComponentEnvConfigSchema(envSchema.prefix.toUpperCase());
    const col = zodObjectToTableColumns(z.object({...common.shape,...envSchema.env.shape}), 'out');
    const tableContent = markdownTable([
        ['Environmental Variable', 'Type', 'Default', 'Description'],
        ...mdCols(col)
    ]);
    writeFileSync(resolve(projectRootDir, `docsite/docs/configuration/clients/_env_configs/_${k}.md`), tableContent);
}

const sourcesEntries = Object.entries(sourceConfigSchemaMapAsync);
for(const [k,v] of sourcesEntries) {
    const [fileSchema, aioSchema, envSchemas] = await v();
    writeFileSync(resolve(projectRootDir, `docsite/static/schemas/${k}-source.json`), JSON.stringify(generateSchema(z.array(fileSchema))));

    const envSchema = envSchemas;
    const common = generateCommonComponentEnvConfigSchema(envSchema.prefix.toUpperCase());
    const col = zodObjectToTableColumns(z.object({...common.shape,...envSchema.env.shape}), 'out');
    const tableContent = markdownTable([
        ['Environmental Variable', 'Type', 'Default', 'Description'],
        ...mdCols(col)
    ]);
    writeFileSync(resolve(projectRootDir, `docsite/docs/configuration/sources/_env_configs/_${k}.md`), tableContent);
}

const aioStrongConfigSchema = aioConfigSchema.extend({
    sources: z.array(sourceAIOConfigSchema).optional()
})

writeFileSync(resolve(projectRootDir, 'docsite/static/schemas/aio.json'), JSON.stringify(generateSchema(aioStrongConfigSchema, 'ref')));
