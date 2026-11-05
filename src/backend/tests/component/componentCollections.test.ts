import { expect } from 'chai';
import { describe, it } from 'mocha';
import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import type { MSBackendEventMap } from '../../common/infrastructure/MSBackendEventMap.ts';
import { TestSource } from '../source/TestSource.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };

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
});
