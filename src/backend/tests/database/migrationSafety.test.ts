import { assert } from 'chai';
import { describe, it } from 'mocha';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRootDir } from '../../common/infrastructure/Atomic.ts';

/**
 * drizzle-kit rebuilds SQLite tables (CREATE __new_x, copy, DROP x) for some column changes.
 * migrate() runs inside a transaction where PRAGMA foreign_keys=OFF is a no-op,
 * so dropping a table that other tables reference cascade-deletes those rows.
 *
 * These tables are referenced by user data that must never be wiped by a migration.
 * Changes to them must be ADD COLUMN / CREATE INDEX only.
 * */
const PROTECTED_TABLES = ['plays', 'plays_historical', 'users', 'components'];

describe('Migration Safety', function () {
    it('never rebuilds a referenced table', async function () {
        const folder = path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations');
        const dirs = await readdir(folder, { withFileTypes: true });
        const offenders: string[] = [];
        for (const d of dirs.filter(x => x.isDirectory())) {
            const sql = await readFile(path.join(folder, d.name, 'migration.sql'), 'utf-8');
            for (const t of PROTECTED_TABLES) {
                if (new RegExp(`__new_${t}\\b`).test(sql)) {
                    offenders.push(`${d.name} rebuilds ${t}`);
                }
            }
        }
        assert.isEmpty(offenders, offenders.join('\n'));
    });
});
