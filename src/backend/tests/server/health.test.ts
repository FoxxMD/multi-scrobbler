import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest';
import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer } from '../../server/index.ts';
import type { ListenbrainzEndpointSourceConfig } from '../../common/infrastructure/config/source/endpointlz.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };

const defaultLzConfig: ListenbrainzEndpointSourceConfig & { source: string } = {
    id: 'test',
    enable: true,
    data: {},
    source: 'file'
};

const buildApp = async () => {
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    await sources.addSource('endpointlz', [defaultLzConfig]);
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const [app] = await initServer({ sources, clients }, { testMode: true });
    return app;
};

describe('Health Endpoint', function () {

    it('accepts a request with no query parameters', async function () {
        const response = await request(await buildApp()).get('/api/health');

        expect(response.status).to.not.eq(400);
        expect(response.body).to.have.property('messages');
    });

    it('accepts a request filtered by type and name', async function () {
        const response = await request(await buildApp())
            .get('/api/health')
            .query({ type: 'endpointlz', name: 'test' });

        expect(response.status).to.not.eq(400);
        expect(response.body).to.have.property('messages');
    });

    it('accepts a request filtered by only one of type or name', async function () {
        const app = await buildApp();

        for (const query of [{ type: 'endpointlz' }, { name: 'test' }]) {
            const response = await request(app).get('/api/health').query(query);
            expect(response.status, JSON.stringify(query)).to.not.eq(400);
            expect(response.body, JSON.stringify(query)).to.have.property('messages');
        }
    });

    it('follows the /health redirect while preserving the query string', async function () {
        const response = await request(await buildApp())
            .get('/health?type=endpointlz')
            .redirects(1);

        expect(response.status).to.not.eq(400);
        expect(response.body).to.have.property('messages');
    });
});
