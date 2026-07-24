import {generate} from 'ts-to-zod';
import * as fs from 'node:fs';

const args = process.argv;
const path = args[2];

const res = generate({
        sourceText: fs.readFileSync(path).toString(),
        jsDocTagFilter: (tags) => tags.map((tag) => tag.name).includes("zod"),
});

fs.writeFileSync(path.replace('.ts','.zod.ts'), res.getZodSchemasFile(path));