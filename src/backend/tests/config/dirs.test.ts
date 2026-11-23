import { expect } from 'chai';
import { describe, it } from 'mocha';
import path from 'node:path';
import { getConfigDir, getDataDir, getLogsDir } from '../../common/index.ts';
import { createTmpDir } from '../utils/tmpDir.ts';

/**
 * Run fn with cwd and env temporarily changed.
 *
 * fn must be synchronous so that cwd/env are always restored before any other test can run
 * (an async fn that times out would leave cwd changed for the rest of the suite)
 * */
const withCwdEnv = <T>(cwd: string, env: Record<string, string | undefined>, fn: () => T): T => {
    const ogCwd = process.cwd();
    const ogEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
    const setEnv = (vals: Record<string, string | undefined>) => {
        for (const [k, v] of Object.entries(vals)) {
            if (v === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = v;
            }
        }
    }
    try {
        process.chdir(cwd);
        setEnv(env);
        return fn();
    } finally {
        setEnv(ogEnv);
        process.chdir(ogCwd);
    }
}

describe('Config and Data Directories', function () {

    it('resolves relative CONFIG_DIR from cwd', async function () {
        await using tmp = await createTmpDir('configDirCwd');
        const dir = withCwdEnv(tmp.path, { CONFIG_DIR: './myConfig', CONFIGURATION_DIRECTORY: undefined }, getConfigDir);
        expect(dir).eq(path.join(tmp.path, 'myConfig'));
    });

    it('resolves relative DATA_DIR from cwd', async function () {
        await using tmp = await createTmpDir('dataDirCwd');
        const dir = withCwdEnv(tmp.path, { DATA_DIR: './myData', STATE_DIRECTORY: undefined }, getDataDir);
        expect(dir).eq(path.join(tmp.path, 'myData'));
    });

    it('resolves relative LOGS_DIR from cwd', async function () {
        await using tmp = await createTmpDir('logsDirCwd');
        const dir = withCwdEnv(tmp.path, { LOGS_DIR: './myLogs', LOGS_DIRECTORY: undefined, DATA_DIR: './myData' }, getLogsDir);
        expect(dir).eq(path.join(tmp.path, 'myLogs'));
    });
});
