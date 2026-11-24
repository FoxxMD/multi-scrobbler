import { before, afterEach, describe, it } from 'mocha';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { createTmpDir } from '../utils/tmpDir.ts';
import {constants, copyFile, access} from 'node:fs/promises';
import path from "path";
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import EventEmitter from "events";
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import {loggerTest} from '@foxxmd/logging';
import { clientTypes } from "../../../core/Atomic.ts";
import { projectRootDir } from "../../common/infrastructure/Atomic.ts";
import { sourceTypes } from "../../../core/Atomic.ts";
import { difference } from '../../../core/DataUtils.ts';
import { getSourceEnvSchema, validateSourceJson } from '../../common/infrastructure/config/source/sourcesMap.ts';
import { parseBytes, readJson } from '../../utils/DataUtils.ts';
import { prettifyError, ZodError } from 'zod';
import { getClientEnvSchema, validateClientJson } from '../../common/infrastructure/config/client/clientsMap.ts';
import type { MSBackendEventMap } from '../../common/infrastructure/MSBackendEventMap.ts';
import { zocker } from "zocker";
import { generateCommonComponentEnvConfigSchema } from '../../common/infrastructure/config/common.ts';
import { serializeError } from 'serialize-error';
import { httpUrl, wsUrl } from '../../utils/ZodUtils.ts';
import { generateNormalHttpUrl, generateNormalWSUrl } from '../../../core/tests/utils/apiFixtures.ts';

chai.use(asPromised);

const samplePath = (name: string) => path.resolve(projectRootDir, 'config', `${name}.json.example`);

describe('Sample Configs', function () {

    describe('Exist', function() {
        describe('Source Configs', function () {
            for(const componentType of sourceTypes) {
                it(`Sample ${componentType}.json exists`, async function () {
                    await access(samplePath(componentType), constants.F_OK);
                });
            }

        });
        describe('Client Configs', function () {
            for(const componentType of clientTypes) {
                it(`Sample ${componentType}.json exists`, async function () {
                    await access(samplePath(componentType), constants.F_OK);
                });
            }
        });
    });

    describe('Parse and Validate Correctly', function () {

        describe('Source Configs', function () {
            let tmp: Awaited<ReturnType<typeof createTmpDir>>;
            let ogKeys: string[] = [];

            before(function() {
                ogKeys = Object.keys(process.env);
            });

            beforeEach(async function() {
                tmp = await createTmpDir('sourceConfigParse');
            });

            afterEach(async function() {
                await tmp.remove();
                const envKeys = Object.keys(process.env);
                const addedKeys = difference(envKeys, ogKeys);
                for(const k of addedKeys) {
                    delete process.env[k];
                }
            });


            for(const componentType of sourceTypes) {

                //trueName = componentType;
                it(`Sample ${componentType}.json parses and validates in isolation`, async function () {
                    this.timeout(5000);

                    await copyFile(samplePath(componentType), path.join(tmp.path, `${componentType}.json`));

                    let fileContents = await readJson(path.join(tmp.path, `${componentType}.json`));
                    fileContents = fileContents.filter((x: any) => x.configureAs === undefined || x.configureAs === 'source');
                    for (const [i,rawConf] of fileContents.entries()) {
                        try {
                            await validateSourceJson(componentType, rawConf);
                        } catch (e) {
                            if(e instanceof ZodError) {
                                expect.fail(`Validation failed for config entry ${i}:\n${prettifyError(e)}`);
                            } else {
                                throw e;
                            }
                        }
                    }
                });

                it(`Sample ${componentType}.json parses and validates in ScrobbleSources`, async function () {
                    this.timeout(5000);

                    const emitter = new WildcardEmitter<MSBackendEventMap>();
                    await copyFile(samplePath(componentType), path.join(tmp.path, `${componentType}.json`));
                    const sources = new ScrobbleSources(emitter, {
                        localUrl: new URL('http://example.com'),
                        configDir: tmp.path,
                        dataDir: tmp.path,
                        version: 'test'
                    }, loggerTest);

                    await sources.buildSourcesFromConfig();
                    expect(sources.sources).length(1);
                    for(const s of sources.sources) {
                        await s.destroy();
                    }
                });

                it(`Sample ${componentType} ENV parses and validates in ScrobbleSources`, async function () {
                    this.timeout(5000);

                    const emitter = new WildcardEmitter<MSBackendEventMap>();
                    
                    const envSchema = await getSourceEnvSchema(componentType);
                    let zocObj = zocker(envSchema.env)
                    .supply(httpUrl, () => generateNormalHttpUrl())
                    .supply(wsUrl, () => generateNormalWSUrl())
                    switch(componentType) {
                        case 'azuracast':
                            zocObj = zocObj.supply(envSchema.env.shape.AZURA_LISTENERS_NUM, true)
                            break;
                        case 'rocksky':
                            zocObj = zocObj.supply(envSchema.env.shape.SOURCE_ROCKSKY_HANDLE, 'foxxmd.dev')
                            break;
                        case 'applemusic':
                            delete zocObj.schema.shape.APPLEMUSIC_KEY_ID;
                            delete zocObj.schema.shape.APPLEMUSIC_TEAM_ID;
                            delete zocObj.schema.shape.APPLEMUSIC_KEY_P8
                            zocObj = zocObj.supply(envSchema.env.shape.APPLEMUSIC_MEDIA_USER_TOKEN, '1234')
                            .supply(envSchema.env.shape.APPLEMUSIC_TOKEN, '5678')
                            .supply(envSchema.env.shape.APPLEMUSIC_ORIGIN_HEADER, 'https://apple.music.com');
                    }
                    const componentMockData = zocObj.generate();
                    const primitives = generateCommonComponentEnvConfigSchema(envSchema.prefix.toLocaleUpperCase());
                    const primitiveMockData = zocker(primitives).generate();
                    primitiveMockData[`${envSchema.prefix.toLocaleUpperCase()}_ENABLE`] = true;

                    const mockData: Record<string, any> = {
                        ...componentMockData,
                        ...primitiveMockData
                    }

                    for(const key of Object.keys(mockData)) {
                        if(mockData[key] === undefined || mockData[key] === null) {
                            continue;
                        }
                        process.env[key] = mockData[key].toString();
                    }

                    const sources = new ScrobbleSources(emitter, {
                        localUrl: new URL('http://example.com'),
                        configDir: tmp.path,
                        dataDir: tmp.path,
                        version: 'test'
                    }, loggerTest);
                    await sources.buildSourcesFromConfig()
                    expect(sources.configErrors,`${sources.configErrors.map(x => typeof x === 'string' ? x : JSON.stringify(serializeError(x), undefined, 2)).join('\n')}`).is.empty;
                    expect(sources.instantiateErrors, `${sources.instantiateErrors.map(x => JSON.stringify(serializeError(x), undefined, 2)).join('\n')}`).is.empty;
                    expect(sources.sources).length(1);
                    expect(sources.sources[0].type).eq(componentType);
                    for(const s of sources.sources) {
                        await s.destroy();
                    }
                });
            }
        });

        describe('Client Configs', function () {
            let tmp: Awaited<ReturnType<typeof createTmpDir>>;
            let ogKeys: string[] = [];

            before(function() {
                ogKeys = Object.keys(process.env);
            });

            beforeEach(async function() {
                tmp = await createTmpDir('clientConfigParse');
            });

            afterEach(async function() {
                await tmp.remove();
                const envKeys = Object.keys(process.env);
                const addedKeys = difference(envKeys, ogKeys);
                for(const k of addedKeys) {
                    delete process.env[k];
                }
            });

            for(const componentType of clientTypes) {

                it(`Sample ${componentType}.json parses and validates in isolation`, async function () {
                    this.timeout(5000);

                    const emitter = new EventEmitter();
                    await copyFile(samplePath(componentType), path.join(tmp.path, `${componentType}.json`));

                    let fileContents = await readJson(path.join(tmp.path, `${componentType}.json`));
                    fileContents = fileContents.filter((x: any) => x.configureAs === undefined || x.configureAs === 'client');
                    for (const [i,rawConf] of fileContents.entries()) {
                        try {
                            await validateClientJson(componentType, rawConf);
                        } catch (e) {
                            if(e instanceof ZodError) {
                                expect.fail(`Validation failed for config entry ${i}:\n${prettifyError(e)}`);
                            } else {
                                throw e;
                            }
                        }
                    }
                });

                it(`Sample ${componentType}.json parses and validates in ScrobbleClients`, async function () {
                    this.timeout(500000);

                    const emitter = new WildcardEmitter<MSBackendEventMap>();
                    await copyFile(samplePath(componentType), path.join(tmp.path, `${componentType}.json`));
                    const clients = new ScrobbleClients(emitter, new WildcardEmitter<MSBackendEventMap>, {
                        localUrl: new URL('http://example.com'),
                        configDir: tmp.path,
                        dataDir: tmp.path,
                        version: 'test'
                    },
                    loggerTest);
                    await clients.buildClientsFromConfig();
                    expect(clients.clients).length(1);
                });

                it(`Sample ${componentType} ENV parses and validates in ScrobbleClients`, async function () {
                    this.timeout(5000);

                    const emitter = new WildcardEmitter<MSBackendEventMap>();
                    
                    const envSchema = await getClientEnvSchema(componentType);
                    let zocObj = zocker(envSchema.env)
                    .supply(httpUrl, () => generateNormalHttpUrl())
                    .supply(wsUrl, () => generateNormalWSUrl())
                    switch(componentType) {
                        case 'rocksky':
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_HANDLE, 'foxxmd.dev')
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_TOKEN, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaWQ')
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_RATE_LIMIT_RESERVE, 500)
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_EXPORT_RATE_LIMIT_RESERVE, 1500)
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_KEEP_ALL_HISTORY, 'true')
                            break;
                        case 'tealfm':
                            zocObj = zocObj.supply(envSchema.env.shape.TEALFM_RATE_LIMIT_RESERVE, 500)
                            zocObj = zocObj.supply(envSchema.env.shape.TEALFM_EXPORT_RATE_LIMIT_RESERVE, 1500)
                            zocObj = zocObj.supply(envSchema.env.shape.TEALFM_KEEP_ALL_HISTORY, 'true')
                            break;
                        case 'discord':
                            zocObj = zocObj.supply(envSchema.env.shape.DISCORD_STATUS_OVERRIDE_ALLOW, 'online');
                            zocObj = zocObj.supply(envSchema.env.shape.DISCORD_IPC_LOCATIONS, '/path/to/ipc,192.168.0.100:8999')
                    }
                    const componentMockData = zocObj.generate();
                    const primitives = generateCommonComponentEnvConfigSchema(envSchema.prefix.toLocaleUpperCase(), 'client');
                    const primitiveMockData = zocker(primitives).generate();
                    primitiveMockData[`${envSchema.prefix.toLocaleUpperCase()}_ENABLE`] = true;

                    const mockData: Record<string, any> = {
                        ...componentMockData,
                        ...primitiveMockData
                    }

                    for(const key of Object.keys(mockData)) {
                        if(mockData[key] === undefined || mockData[key] === null) {
                            continue;
                        }
                        process.env[key] = mockData[key].toString();
                    }

                    const clients = new ScrobbleClients(emitter, new WildcardEmitter<MSBackendEventMap>, {
                        localUrl: new URL('http://example.com'),
                        configDir: tmp.path,
                        dataDir: tmp.path,                        
                        version: 'test'
                    },
                    loggerTest);
                    await clients.buildClientsFromConfig()
                    expect(clients.configErrors,`${clients.configErrors.map(x => typeof x === 'string' ? x : JSON.stringify(serializeError(x), undefined, 2)).join('\n')}`).is.empty;
                    expect(clients.instantiateErrors, `${clients.instantiateErrors.map(x => JSON.stringify(serializeError(x), undefined, 2)).join('\n')}`).is.empty;
                    expect(clients.clients).length(1);
                    expect(clients.clients[0].type).eq(componentType);
                    expect(clients.clients[0].config.options?.scrobbleInterval).eq(primitiveMockData[`${envSchema.prefix.toLocaleUpperCase()}_SCROBBLE_INTERVAL`]);
                    if(componentType === 'tealfm' || componentType === 'rocksky') {
                        expect(clients.clients[0].config.options).to.include({rateLimitReserve: 500, exportRateLimitReserve: 1500});
                    }
                });
            }
        });
    });
});

describe('Global ENVs with Config', function () {

    let baseEnvKeys: string[] = [];
    let tmp: Awaited<ReturnType<typeof createTmpDir>>;

    before(function() {
        baseEnvKeys = Array.from(Object.keys(process.env));
    });

    beforeEach(async function() {
        tmp = await createTmpDir('globalEnvConfig');
    });

    afterEach(async function() {
        await tmp.remove();
        const modified = difference(Array.from(Object.keys(process.env)), baseEnvKeys);
        for(const key of modified) {
            delete process.env[key];
        }
    });

    it('Parses default scrobble duration', async function () {
        process.env.SOURCE_SCROBBLE_DURATION = '20';
        process.env.MPRIS_ID = 'test';
        process.env.MPRIS_ENABLE = 'true';

        const emitter = new WildcardEmitter<MSBackendEventMap>();
        const sources = new ScrobbleSources(emitter, {
            localUrl: new URL('http://example.com'),
            configDir: tmp.path,
            dataDir: tmp.path,
            version: 'test'
        }, loggerTest);
        await sources.buildSourcesFromConfig();

        expect(sources.sources).length(1);
        expect(sources.sources[0].config?.options?.scrobbleThresholds?.duration).to.eq(20);
    });

    it('Parses default scrobble precentage', async function () {
        process.env.SOURCE_SCROBBLE_PERCENT = '20';
        process.env.MPRIS_ID = 'test';
        process.env.MPRIS_ENABLE = 'true';

        const emitter = new WildcardEmitter<MSBackendEventMap>();
        const sources = new ScrobbleSources(emitter, {
            localUrl: new URL('http://example.com'),
            configDir: tmp.path,
            dataDir: tmp.path,
            version: 'test'
        }, loggerTest);
        await sources.buildSourcesFromConfig();

        expect(sources.sources).length(1);
        expect(sources.sources[0].config?.options?.scrobbleThresholds?.percent).to.eq(20);
    });

});
describe('Ingress maxBodySize', function () {

    it('parses sizes with a unit, case-insensitive', function () {
        expect(parseBytes('2MB')).eq(2 * 1024 * 1024);
        expect(parseBytes('500kb')).eq(500 * 1024);
        expect(parseBytes('1.5 Kb')).eq(1536);
        expect(parseBytes('2')).is.undefined;
        expect(parseBytes('2TB')).is.undefined;
    });

    it('rejects an invalid size in Source config', async function () {
        await expect(validateSourceJson('endpointlz', {id: 'test', options: {maxBodySize: 'lots'}})).to.be.rejected;
        await expect(validateSourceJson('endpointlfm', {id: 'test', options: {maxBodySize: '2mb'}})).to.be.fulfilled;
    });
});
