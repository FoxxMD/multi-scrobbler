import { expect } from 'chai';
import { describe, it } from 'mocha';
import { loggerTest } from '@foxxmd/logging';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import dayjs from 'dayjs';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer, type ServerLocals } from '../../server/index.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import { getRoot } from '../../ioc.ts';
import { ensureOwner } from '../../common/auth/owner.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' };

const waitFor = async (check: () => boolean, what: string, timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${what}`);
        }
        await new Promise(r => setTimeout(r, 5));
    }
};

describe('Job SSE events', function () {
    it("forwards job events only to the owner's sessions, serializing dates and errors", async function () {
        const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
        const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
        const jobs = new JobManager({db: await getRoot().items.db(), logger: loggerTest});
        const [app] = await initServer({sources, clients, jobs}, {testMode: true});
        const {db} = app.locals as ServerLocals;
        // unsecured test mode resolves every request to the owner
        const owner = await ensureOwner(db);
        const server = http.createServer(app).listen(0);
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const abort = new AbortController();
        try {
            const res = await fetch(`${base}/api/events?tab=jobs`, {signal: abort.signal});
            let received = '';
            void (async () => {
                const decoder = new TextDecoder();
                try {
                    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
                        received += decoder.decode(chunk);
                    }
                } catch {
                    // aborted
                }
            })();
            // registered once a component event round trips
            await waitFor(() => {
                sources.emitter.emit('componentUpdate', {type: 'endpointlz', name: 'test', componentId: 1, from: 'source', data: {status: 'ping'}});
                return received.includes('ping');
            }, 'connection');

            jobs.emitter.emit('jobUpdate', {jobId: 7, userId: 'someone-else', data: {name: 'not mine'}});
            jobs.emitter.emit('jobUpdate', {jobId: 8, userId: owner.id, data: {importStartedAt: dayjs('2014-01-03T04:36:11Z'), importError: new Error('boom')}});
            jobs.emitter.emit('mirrorUpdate', {mirrorId: 3, userId: 'someone-else', data: {name: 'not my mirror'}});
            jobs.emitter.emit('mirrorUpdate', {mirrorId: 4, userId: owner.id, data: {name: 'my mirror'}});
            jobs.emitter.emit('mirrorDeleted', {mirrorId: 5, userId: owner.id});
            jobs.emitter.emit('playsPurged', {componentId: 6});
            jobs.emitter.emit('clientJobPlaysUpdate', {componentId: 6, data: {task: null}});
            jobs.emitter.emit('jobDeleted', {jobId: 9, userId: owner.id});

            await waitFor(() => received.includes('jobDeleted'), 'job events');
            expect(received).to.not.include('not mine');
            expect(received).to.not.include('not my mirror');
            for (const expected of ['"event":"mirrorUpdate","mirrorId":4', '"event":"mirrorDeleted","mirrorId":5', '"event":"playsPurged","componentId":6', '"event":"clientJobPlaysUpdate","componentId":6']) {
                expect(received).to.include(expected);
            }
            const update = received.split('\n').find(l => l.startsWith('data:') && l.includes('"jobId":8'))!;
            const data = JSON.parse(update.slice(5));
            expect(data.event).eq('jobUpdate');
            expect(data.data.importStartedAt).eq('2014-01-03T04:36:11.000Z');
            expect(data.data.importError.message).eq('boom');
        } finally {
            abort.abort();
            server.closeAllConnections();
            server.close();
        }
    });
});
