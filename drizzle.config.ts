import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { configDir, projectDir } from './src/backend/common/index.js';
import * as path from 'path';

export default defineConfig({
  schema: path.resolve(projectDir, 'src/backend/common/database/drizzle/schema'),
  out: path.resolve(projectDir, 'src/backend/common/database/drizzle/migrations'),
  dialect: 'postgresql',
  dbCredentials: {
    url: path.resolve(configDir, 'msDb'),
  },
});