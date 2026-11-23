import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdtempDisposable } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectRootDir } from '../../common/infrastructure/Atomic.ts';

let baseDir: string | undefined;

/**
 * Parent directory for test tmp dirs, resolved once per process:
 *
 * * MS_TEST_TMPDIR env, if set (absolute or relative to project root)
 * * os.tmpdir(), if writable (respects TMPDIR, often ram-backed)
 * * project root (always writable by the user running the tests, `tmp-*` is gitignored)
 * */
export const getTmpBaseDir = (): string => {
    if (baseDir !== undefined) {
        return baseDir;
    }
    const envDir = process.env.MS_TEST_TMPDIR;
    if (envDir !== undefined && envDir.trim() !== '') {
        baseDir = path.resolve(projectRootDir, envDir);
        mkdirSync(baseDir, { recursive: true });
        return baseDir;
    }
    try {
        rmSync(mkdtempSync(path.join(os.tmpdir(), 'tmp-ms-probe-')), { recursive: true, force: true });
        baseDir = os.tmpdir();
    } catch {
        baseDir = projectRootDir;
    }
    return baseDir;
}

/**
 * Create a new, randomly named, empty tmp dir for a test. Does NOT change cwd so use the returned `path` for any file paths.
 *
 * Use with `await using tmp = await createTmpDir('myTest')` to remove the dir when the scope ends,
 * or call `tmp.remove()` (ie in afterEach) when created in a hook.
 * */
export const createTmpDir = async (postfix?: string) =>
    mkdtempDisposable(path.join(getTmpBaseDir(), `tmp-ms-${process.pid}-${postfix !== undefined ? `${postfix}-` : ''}`));
