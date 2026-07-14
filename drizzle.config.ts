import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { getDataDir } from './src/backend/common/index.js';
import * as path from 'path';
import { projectRootDir } from './src/core/Atomic.ts';

export default defineConfig({
  schema: path.resolve(projectRootDir, 'src/backend/common/database/drizzle/schema'),
  out: path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations'),
  dialect: 'sqlite',
  dbCredentials: {
    url: path.resolve(getDataDir(), 'ms.db'),
  },
});