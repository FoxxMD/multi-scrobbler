import path from 'path';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

export const projectDir = path.resolve(__dirname, '../../');
export const configDir: string = path.resolve(projectDir, './config');
