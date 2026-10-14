import { expect } from 'chai';
import { describe, it } from 'mocha';
import { loggerTest } from '@foxxmd/logging';
import { PassThrough } from 'node:stream';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer } from '../../server/index.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SSE Events Endpoint', function () {

    it('only pushes log events to a connection while logs are enabled for its tab, and cleans up on disconnect', async function () {
        const appLoggerStream = new PassThrough({ objectMode: true });
        const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
        const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
        const [app] = await initServer({ sources, clients }, { testMode: true, appLoggerStream });
        const server = http.createServer(app).listen(0);
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const baseListeners = appLoggerStream.listenerCount('data');

        const writeLog = (line: string) => appLoggerStream.write({ level: 30, line, time: Date.now() });
        const setLogs = (enabled: boolean) => fetch(`${base}/api/events/tab1/logs`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        try {
            await fetch(`${base}/api/logs`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level: 'trace' })
            });

            expect((await setLogs(true)).status, 'no connection for tab yet').to.eq(404);

            const abort = new AbortController();
            const res = await fetch(`${base}/api/events?next=true&tab=tab1`, { signal: abort.signal });
            let received = '';
            const reading = (async () => {
                const decoder = new TextDecoder();
                try {
                    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
                        received += decoder.decode(chunk);
                    }
                } catch {
                    // aborted
                }
            })();
            await sleep(50);
            expect(appLoggerStream.listenerCount('data')).to.eq(baseListeners + 1);

            writeLog('before enable');
            expect((await setLogs(true)).status).to.eq(200);
            writeLog('while enabled');
            expect((await setLogs(false)).status).to.eq(200);
            writeLog('after disable');
            await sleep(50);

            expect(received).to.include('event:log');
            expect(received).to.include('while enabled');
            expect(received).to.not.include('before enable');
            expect(received).to.not.include('after disable');

            abort.abort();
            await reading;
            await sleep(50);
            expect(appLoggerStream.listenerCount('data'), 'log listener removed on disconnect').to.eq(baseListeners);
            expect((await setLogs(true)).status, 'tab forgotten on disconnect').to.eq(404);
        } finally {
            server.closeAllConnections();
            server.close();
        }
    });
});
