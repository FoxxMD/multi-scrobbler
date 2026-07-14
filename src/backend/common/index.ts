import * as path from 'path';

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

export const projectDir = process.cwd(); //path.resolve(__dirname, '../../../');
export const configDir: string = process.env.CONFIG_DIR || path.resolve(projectDir, `./config`);
export const getPathFromCWD = (...relativePaths: string[]) => path.resolve(process.cwd(), ...relativePaths);