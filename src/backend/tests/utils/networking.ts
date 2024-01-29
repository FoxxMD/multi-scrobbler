import { NodeNetworkErrorCode, NodeNetworkException } from "../../common/errors/NodeErrors.js";
import {  setupServer, SetupServer } from 'msw/node';

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
 * */

export type ServerOptions = Parameters<typeof setupServer>;

export const withRequestInterception =
    (handlers: ServerOptions, test: (server: SetupServer) => any) => async () => {
        const server = setupServer(...handlers);
        server.listen();

        return Promise.resolve(test(server)).finally(() => {
            server.resetHandlers();
            server.close();
        });
};
