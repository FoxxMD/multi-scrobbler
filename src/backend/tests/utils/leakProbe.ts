/**
 * Leak probe: find tests that leave timers/sockets/handles open (the reason mocha hangs without `exit: true`).
 *
 * Usage:
 *   npm run test:leaks                                          # whole suite
 *   npm run test:leaks -- src/backend/tests/foo/foo.test.ts     # only these files (any other mocha args work too, ie --grep)
 *
 * Uses leakProbe.mocharc.cjs: .mocharc.json with exit: false and this file required first.
 *
 * How it works:
 * * async_hooks records a stack trace and the currently running test for every timer/socket/server/fs handle created.
 * * Destroyed handles are forgotten. Handles that are unref'd (can't keep the process alive) are ignored.
 * * After the last test (and mocha's summary) a grace period passes, then:
 *   * if the process exits on its own there are no leaks and it says so.
 *   * otherwise every still-alive handle is printed, grouped by where it was created, and the process exits with code 1
 *     (instead of hanging forever).
 *
 * Env:
 * * LEAK_PROBE_GRACE  ms to wait after the run before reporting, so handles closing shortly after aren't reported. Default 1000
 * * LEAK_PROBE_FRAMES stack frames shown per group. Default 6
 * * LEAK_PROBE_TESTS  test titles listed per group. Default 3
 * * LEAK_PROBE_ALL    1 = include node_modules/internal frames when grouping (default groups by first frames, node_modules collapsed to package name)
 *
 * "created during" is the test that was running (set in a root beforeEach). Handles created in a describe-level before()
 * are attributed to the previous test, so also look at the "test file" line, which comes from the stack.
 * */
import { createHook } from 'node:async_hooks';
import path from 'node:path';

const GRACE = Number.parseInt(process.env.LEAK_PROBE_GRACE ?? '1000');
const FRAMES = Number.parseInt(process.env.LEAK_PROBE_FRAMES ?? '6');
const TESTS = Number.parseInt(process.env.LEAK_PROBE_TESTS ?? '3');
const ALL_FRAMES = process.env.LEAK_PROBE_ALL === '1';

// resource types that can keep the event loop alive (libuv handles and timers).
// Promises, FILEHANDLE, http messages etc. never block exit by themselves so they are not tracked
const TRACKED = new Set(['Timeout', 'Immediate', 'TCPWRAP', 'TCPSERVERWRAP', 'PIPEWRAP', 'PIPESERVERWRAP', 'UDPWRAP', 'PROCESSWRAP', 'FSEVENTWRAP', 'STATWATCHER', 'SIGNALWRAP', 'TTYWRAP']);

const root = process.cwd();
const self = import.meta.filename;

interface Tracked {
    type: string
    stack: string[]
    test: string
    resource: { hasRef?: () => boolean }
}

const live = new Map<number, Tracked>();
let currentTest = '(before any test)';

const cleanFrame = (frame: string) => frame.trim().replace(/^at /, '').replace('file://', '').replaceAll(`${root}${path.sep}`, '');

createHook({
    init(asyncId, type, _triggerId, resource) {
        if (!TRACKED.has(type)) {
            return;
        }
        const prevLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 40;
        const raw = new Error().stack ?? '';
        Error.stackTraceLimit = prevLimit;
        const stack = raw.split('\n').slice(1)
            .filter(x => !x.includes('node:internal') && !x.includes(self) && !x.includes('(node:') && x.includes('at '))
            .map(cleanFrame);
        live.set(asyncId, {type, stack, test: currentTest, resource: resource as Tracked['resource']});
    },
    destroy(asyncId) {
        live.delete(asyncId);
    },
}).enable();

/** ref'd = keeps the process alive. unref'd handles are ignored */
const isAlive = (x: Tracked) => typeof x.resource?.hasRef === 'function' && x.resource.hasRef();

const isTestFrame = (frame: string) => /src\/backend\/tests\/.+\.test\.ts:\d+/.test(frame);
const testLocation = (frame: string) => frame.match(/(src\/backend\/tests\/[^:)]+\.test\.ts:\d+)/)?.[1];

/**
 * Frames identifying where a handle was created, up to (not including) the first frame in a test file,
 * so the same leak created from many tests/lines is one group. node_modules frames collapse to the package name.
 * */
const groupFrames = (stack: string[]) => {
    const firstTest = stack.findIndex(isTestFrame);
    const app = firstTest === -1 ? stack : stack.slice(0, firstTest);
    if (ALL_FRAMES) {
        return app.slice(0, FRAMES);
    }
    const out: string[] = [];
    for (const frame of app) {
        const nm = frame.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
        const label = nm !== null ? `[${nm[1]}]` : frame;
        if (out[out.length - 1] !== label) {
            out.push(label);
        }
        if (out.length === FRAMES) {
            break;
        }
    }
    return out;
};

/** stdio pipes/ttys are created lazily on first console use and are never leaks */
const isStdio = (x: Tracked) => [process.stdin, process.stdout, process.stderr].some(s => (s as unknown as {_handle?: unknown})._handle === x.resource);

const report = () => {
    const leaks = Array.from(live.values()).filter(x => isAlive(x) && !isStdio(x));
    if (leaks.length === 0) {
        // only unref'd/stdio handles remain, the process exits on its own
        return;
    }
    const groups = new Map<string, { type: string, frames: string[], tests: Set<string>, locations: Set<string>, count: number }>();
    for (const leak of leaks) {
        const frames = groupFrames(leak.stack);
        const key = `${leak.type}\n${frames.join('\n')}`;
        const g = groups.get(key) ?? {type: leak.type, frames, tests: new Set(), locations: new Set(), count: 0};
        g.count++;
        g.tests.add(leak.test);
        // first test-file frame is where test code (a test, hook or fixture helper) led to the handle
        const loc = leak.stack.map(testLocation).find(x => x !== undefined);
        if (loc !== undefined) {
            g.locations.add(loc);
        }
        groups.set(key, g);
    }
    const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count);
    const byType = leaks.reduce<Record<string, number>>((acc, x) => ({...acc, [x.type]: (acc[x.type] ?? 0) + 1}), {});

    const lines: string[] = ['', `=== Leak probe: ${leaks.length} handle(s) still keeping the process alive ${GRACE}ms after the run, ${sorted.length} group(s) ===`];
    lines.push(`By type: ${Object.entries(byType).map(([t, c]) => `${t} ${c}`).join(', ')}`);
    for (const [i, g] of sorted.entries()) {
        lines.push('', `--- #${i + 1} ${g.type} x${g.count} ---`);
        const tests = Array.from(g.tests);
        lines.push(`created during (${tests.length} test(s)):`);
        for (const t of tests.slice(0, TESTS)) {
            lines.push(`  ${t}`);
        }
        if (tests.length > TESTS) {
            lines.push(`  ...and ${tests.length - TESTS} more`);
        }
        if (g.locations.size > 0) {
            const locs = Array.from(g.locations);
            lines.push(`from test code: ${locs.slice(0, TESTS).join(', ')}${locs.length > TESTS ? `, ...and ${locs.length - TESTS} more` : ''}`);
        }
        lines.push('created at:');
        if (g.frames.length === 0) {
            lines.push('  (no user-land stack, created by node internals)');
        }
        for (const f of g.frames) {
            lines.push(`  ${f}`);
        }
    }
    lines.push('', 'Fix the groups above, or rerun one file with `npm run test:leaks -- <file>` to narrow it down.', '');
    console.error(lines.join('\n'));
    // mocha's own 'exit' listener sets exitCode to the failure count, a listener added after it runs last and wins
    process.on('exit', () => {
        process.exitCode = 1;
    });
    process.exit(1);
};

export const mochaHooks = {
    beforeEach(this: Mocha.Context) {
        const t = this.currentTest;
        if (t !== undefined) {
            currentTest = `${path.relative(root, t.file ?? '')} :: ${t.fullTitle()}`;
        }
    },
    afterAll() {
        currentTest = '(after all tests)';
        // unref'd: if nothing else is alive the process exits normally and this never fires
        setTimeout(report, GRACE).unref();
        process.once('beforeExit', () => console.error('\n=== Leak probe: no leaked handles, process exited on its own ===\n'));
    },
};
