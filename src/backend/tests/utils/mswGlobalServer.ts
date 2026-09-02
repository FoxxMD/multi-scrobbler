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
server.events.on('request:unhandled', ({ request }) => {
    console.log('MSW unhandled:', request.method, request.url)
});
