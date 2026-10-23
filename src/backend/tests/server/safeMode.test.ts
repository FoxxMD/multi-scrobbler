import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest';
import { loggerTest } from '@foxxmd/logging';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer } from '../../server/index.ts';
import { WebFault } from '../../server/middleware.ts';

const internalConfig = { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' };

const buildApp = async () => {
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    const webFault = new WebFault(loggerTest);
    const [app] = await initServer({ sources, clients }, { testMode: true, webFault });
    return { app, sources, webFault };
};

describe('Web Server Safe Mode', function () {

    it('returns 500 for an error escaping a route handler without entering safe mode', async function () {
        const { app, sources, webFault } = await buildApp();
        sources.getStatusSummary = async () => {
            throw new Error('route bug');
        };

        const response = await request(app).get('/api/health');

        expect(response.status).to.eq(500);
        expect(response.body).to.have.property('error');
        expect(webFault.fault).to.be.undefined;

        const components = await request(app).get('/api/components');
        expect(components.status).to.eq(200);
    });

    it('returns 503 for API routes once faulted, except health and version', async function () {
        const { app, webFault } = await buildApp();
        webFault.report(new Error('server broke'));

        const components = await request(app).get('/api/components');
        expect(components.status).to.eq(503);
        expect(components.body.cause).to.eq('server broke');

        const health = await request(app).get('/api/health');
        expect(health.status).to.eq(503);
        expect(health.body.messages[0]).to.include('safe mode');

        const version = await request(app).get('/api/version');
        expect(version.status).to.eq(200);
    });

    it('only calls onFault for the first fault', async function () {
        let calls = 0;
        const webFault = new WebFault(loggerTest, () => { calls++; });
        webFault.report(new Error('first'));
        webFault.report(new Error('second'));

        expect(calls).to.eq(1);
        expect(webFault.fault?.error.message).to.eq('first');
    });

    it('does not throw into the emitter when forwarding an event to SSE fails', async function () {
        const { sources, webFault } = await buildApp();
        const badPayload = {
            from: 'source',
            get data() {
                throw new Error('cannot serialize');
            }
        };

        // emitter is typed with the real event map, this payload is deliberately invalid
        expect(() => (sources.emitter as unknown as WildcardEmitter).emit('componentUpdate', badPayload)).to.not.throw();
        expect(webFault.fault).to.be.undefined;
    });
});
