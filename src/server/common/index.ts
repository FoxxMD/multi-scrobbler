import * as path from 'path';
//import {fileURLToPath} from "url";

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

export const projectDir = process.cwd(); //path.resolve(__dirname, '../../../');
export const configDir: string = path.resolve(projectDir, './config');
