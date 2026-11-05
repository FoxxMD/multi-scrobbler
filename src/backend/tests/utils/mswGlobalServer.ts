import { setupServer, type SetupServer } from 'msw/node';

/**
 * Must be loaded (via .mocharc.json "file") before any spec file, and must have no
 * other imports, so this listen() call wins the race against any library (like
 * lastfm-ts-api) that freezes a reference to `https.request` at its own module load.
 * @see https://github.com/nock/nock/issues/2397#issuecomment-1591090893
 */
import { syncBuiltinESMExports } from 'node:module';

export const server: SetupServer = setupServer();
server.listen({ onUnhandledRequest: 'bypass' });
// Reassigning https.request/http.request only patches the CJS exports object.
// Named ESM imports of those exports (e.g. `import { request } from 'node:https'`,
// used by lastfm-ts-api) resolve to a snapshot taken independently of that
// reassignment, so they never see MSW's patched version without this call.
// @see https://nodejs.org/api/module.html#modulesyncbuiltinesmexports
syncBuiltinESMExports();

export interface UnhandledLogging {
    /** log requests no msw handler matched. Default true */
    enabled: boolean
    /**
     * also log requests to loopback hosts. Default false
     * because those are real requests on purpose (supertest, a local http server), not missing mocks
     * */
    loopback: boolean
}
const unhandledLogging: UnhandledLogging = {enabled: true, loopback: false};
/**
 * Change unhandled request logging. Returns the previous settings, to restore them.
 * Prefer `withUnhandledLogging()` from networking.ts inside a describe.
 * */
export const setUnhandledLogging = (opts: Partial<UnhandledLogging>): UnhandledLogging => {
    const prev = {...unhandledLogging};
    Object.assign(unhandledLogging, opts);
    return prev;
}
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
server.events.on('request:unhandled', ({ request }) => {
    if (!unhandledLogging.enabled) {
        return;
    }
    if (!unhandledLogging.loopback && loopbackHosts.includes(new URL(request.url).hostname)) {
        return;
    }
    console.log('MSW unhandled:', request.method, request.url);
});

// A handler that throws fails the request with that error, which is how MockNetworkError (networking.ts) simulates network failures (EAI_AGAIN...).
// msw then always prints the error plus "[MSW] Encountered an unhandled exception during the handler lookup..." to console.error.
// Its "is anyone listening for unhandledException" check only looks at a private per-request emitter, so server.events listeners cannot silence it.
// Swallow exactly those two outputs for MockNetworkError (thrown on purpose), any other thrown error is a real handler bug and still prints.
// ponytail: depends on msw's console output, drop this if msw adds a way to handle unhandled exceptions (checked msw 2.14.6)
const consoleError = console.error;
let swallowNextLookupMessage = false;
console.error = (...args: unknown[]) => {
    if (args.length === 1 && (args[0] as { isMockNetworkError?: boolean } | null)?.isMockNetworkError === true) {
        swallowNextLookupMessage = true;
        return;
    }
    if (swallowNextLookupMessage) {
        swallowNextLookupMessage = false;
        if (typeof args[0] === 'string' && args[0].startsWith('[MSW] Encountered an unhandled exception during the handler lookup')) {
            return;
        }
    }
    consoleError(...args);
};
