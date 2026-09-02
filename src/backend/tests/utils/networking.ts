import type { setupServer, SetupServer } from 'msw/node';
import type {NodeNetworkErrorCode, NodeNetworkException} from "../../common/errors/NodeErrors.ts";
import { server } from './mswGlobalServer.ts';

export class MockNetworkError extends Error implements NodeNetworkException {

    code: NodeNetworkErrorCode;
    errno?: number;

    constructor(code: string, errno?: number, message?: string) {
        super(message);
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
