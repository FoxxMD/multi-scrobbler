import { expect } from 'chai';
import { spy } from 'sinon';
import { describe, it } from 'mocha';
import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import type { MSBackendEventMap } from '../../common/infrastructure/MSBackendEventMap.ts';
import { TestSource } from '../source/TestSource.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' };

describe('Component Collections', function () {

    it('ScrobbleSources destroy stops every source and its scheduled tasks', async function () {
        const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
        const source = new TestSource('spotify', 'test-collection', {id: `test-${Date.now()}`}, internalConfig, new WildcardEmitter<MSBackendEventMap>());
        await source.initialize();
        source.initTasks({deadDelay: 30});
        sources.sources.push(source);
        expect(source.scheduler.getAllJobs()).to.not.be.empty;

        await sources.destroy();

        expect(source.scheduler.getAllJobs()).to.be.empty;
        expect(source['initDeadTimeout']).to.be.undefined;
    });

    it('Source destroy does not remove listeners other components added to the shared emitter', async function () {
        const emitter = new WildcardEmitter<MSBackendEventMap>();
        const other = () => undefined;
        emitter.on('playerUpdate', other);
        const source = new TestSource('spotify', 'test-destroy', {id: `test-${Date.now()}`}, internalConfig, emitter);
        await source.initialize();

        await source.destroy();

        expect(emitter.listenerCount('playerUpdate')).to.eq(1);
    });

    it('ScrobbleClients destroy stops every client and stops listening to source events', async function () {
        const sourceEmitter = new WildcardEmitter<MSBackendEventMap>();
        const clients = new ScrobbleClients(new WildcardEmitter(), sourceEmitter, internalConfig, loggerTest);
        expect(sourceEmitter.listenerCount('playerUpdate')).to.eq(1);
        expect(sourceEmitter.listenerCount('discoveredToScrobble')).to.eq(1);

        const client = new TestScrobbler();
        await client.initialize();
        client.initTasks({deadDelay: 30});
        clients.clients.push(client);
        expect(client.scheduler.getAllJobs()).to.not.be.empty;

        await clients.destroy();

        expect(client.scheduler.getAllJobs()).to.be.empty;
        expect(client['initDeadTimeout']).to.be.undefined;
        expect(sourceEmitter.listenerCount('playerUpdate')).to.eq(0);
        expect(sourceEmitter.listenerCount('discoveredToScrobble')).to.eq(0);
    });

    it('Source sync dispose signals the running discovery queue to stop without throwing, and logs that it did not wait', async function () {
        const source = new TestSource('spotify', 'test-sync-dispose', {id: `test-${Date.now()}`}, internalConfig, new WildcardEmitter<MSBackendEventMap>());
        await source.initialize();
        await source.startDiscoveryQueue();
        const queue = source['ingressQueuePromise'];
        expect(queue).to.not.be.undefined;
        const debug = spy(source.logger, 'debug');

        expect(() => source[Symbol.dispose]()).to.not.throw();

        // not stopped yet (sync dispose does not wait) but it does stop once processing sees the abort
        await queue;
        expect(source['ingressQueuePromise']).to.be.undefined;
        expect(debug.calledWithMatch(/Disposed synchronously while running discovery queue processing/)).to.be.true;
    });

    it('Client sync dispose signals running scrobble processing to stop without throwing', async function () {
        const client = new TestScrobbler();
        await client.initialize();
        await client.initScrobbleMonitoring();
        const queue = client['ingressQueuePromise'];
        expect(queue).to.not.be.undefined;

        expect(() => client[Symbol.dispose]()).to.not.throw();

        await queue;
        expect(client['ingressQueuePromise']).to.be.undefined;
    });

    it('Async dispose does not log the sync dispose warning', async function () {
        const source = new TestSource('spotify', 'test-async-dispose', {id: `test-${Date.now()}`}, internalConfig, new WildcardEmitter<MSBackendEventMap>());
        await source.initialize();
        await source.startDiscoveryQueue();
        const debug = spy(source.logger, 'debug');

        await source[Symbol.asyncDispose]();

        expect(source['ingressQueuePromise']).to.be.undefined;
        expect(debug.calledWithMatch(/Disposed synchronously/)).to.be.false;
    });
});
