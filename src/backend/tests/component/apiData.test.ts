import { loggerTest } from '@foxxmd/logging';
import { describe, it } from 'mocha';
import { componentClientApiSchema, componentSourceApiSchema } from '../../../core/Api.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import type { MSBackendEventMap } from '../../common/infrastructure/MSBackendEventMap.ts';
import { TestScrobbler } from '../scrobbler/TestScrobbler.ts';
import { TestSource } from '../source/TestSource.ts';

const asJson = (data: object) => JSON.parse(JSON.stringify(data));

describe('Component API data', function () {

    it('Client API data matches its schema', async function () {
        const client = new TestScrobbler();
        await client.initialize();
        componentClientApiSchema.parse(asJson(client.getApiData()));
    });

    it('Source API data matches its schema', async function () {
        await using source = new TestSource('spotify', 'test-api', {id: `test-api-${Date.now()}`}, { localUrl: new URL('https://example.com'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' }, new WildcardEmitter<MSBackendEventMap>());
        await source.initialize();
        componentSourceApiSchema.parse(asJson(source.getApiData()));
    });
});
