import type { setupServer, SetupServer } from 'msw/node';
import type {NodeNetworkErrorCode, NodeNetworkException} from "../../common/errors/NodeErrors.ts";
import { server, setUnhandledLogging, type UnhandledLogging } from './mswGlobalServer.ts';

/**
 * Throw from an msw handler to fail the request with a node network error (EAI_AGAIN, ECONNREFUSED...).
 * msw turns a thrown error into the request's error. mswGlobalServer.ts recognizes this class (by `isMockNetworkError`) as intentional and does not log it
 * */
export class MockNetworkError extends Error implements NodeNetworkException {

    code: NodeNetworkErrorCode;
    errno?: number;
    /** marker for mswGlobalServer.ts, which cannot import this class */
    readonly isMockNetworkError = true;

    constructor(code: string, errno?: number, message?: string) {
        super(message);
        this.name = 'MockNetworkError';
        this.code = code as NodeNetworkErrorCode;
        this.errno = errno;
    }
}

/**
 * Adapted from https://github.com/nock/nock/issues/2397#issuecomment-1591090893
 *
 * Reuses the single process-wide server from mswGlobalServer.ts instead of
 * listen()/close() per test, since some HTTP clients (e.g. lastfm-ts-api) capture a
 * reference to https.request at module load time and never see a re-patched one.
 * */

export type ServerOptions = Parameters<typeof setupServer>;

export const withRequestInterception =
    (handlers: ServerOptions, test: (server: SetupServer) => any) => async () => {
        server.use(...handlers);

        return Promise.resolve(test(server)).finally(() => {
            server.resetHandlers();
        });
};

/**
 * Call inside a describe to change msw unhandled request logging for its tests, restored after the describe (nesting works).
 * EX `withUnhandledLogging({loopback: true})` for tests that mock a localhost service, or `{enabled: false}` to silence noise.
 * */
export const withUnhandledLogging = (opts: Partial<UnhandledLogging>) => {
    let prev: UnhandledLogging | undefined;
    before(() => {
        prev = setUnhandledLogging(opts);
    });
    after(() => {
        if (prev !== undefined) {
            setUnhandledLogging(prev);
        }
    });
}
