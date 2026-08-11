import { before, afterEach, describe, it } from 'mocha';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import withLocalTmpDir from 'with-local-tmp-dir';
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
import { difference } from '../../utils.ts';
import { getSourceEnvSchema, validateSourceJson } from '../../common/infrastructure/config/source/sourcesMap.ts';
import { readJson } from '../../utils/DataUtils.ts';
import { prettifyError, ZodError } from 'zod';
import { getClientEnvSchema, validateClientJson } from '../../common/infrastructure/config/client/clientsMap.ts';
import type { MSBackendEventMap } from '../../common/infrastructure/MSBackendEventMap.ts';
import { zocker } from "zocker";
import pEvent from 'p-event';
import { generateCommonComponentEnvConfigSchema } from '../../common/infrastructure/config/common.ts';
import { serializeError } from 'serialize-error';

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
            let reset: any;
            let ogKeys: string[] = [];

            before(function() {
                ogKeys = Object.keys(process.env);
            });

            beforeEach(async function() {
                reset = await withLocalTmpDir({unsafeCleanup: true, postfix: 'sourceConfigParse'});
            });

            afterEach(async function() {
                await reset();
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

                    await copyFile(samplePath(componentType), `${componentType}.json`);

                    let fileContents = await readJson(`${componentType}.json`);
                    fileContents = fileContents.filter(x => x.configureAs === undefined || x.configureAs === 'source');
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
                    await copyFile(samplePath(componentType), `${componentType}.json`);
                    const sources = new ScrobbleSources(emitter, {
                        localUrl: new URL('http://example.com'),
                        configDir: process.cwd(),
                        version: 'test'
                    }, loggerTest);

                    await sources.buildSourcesFromConfig();
                    expect(sources.sources).length(1);
                    for(const s of sources.sources) {
                        await s.destroy();
                    }
                });

                it(`Sample ${componentType} ENV parses and validates in ScrobbleSources`, async function () {
                    this.timeout(500000);

                    const emitter = new WildcardEmitter<MSBackendEventMap>();
                    
                    const envSchema = await getSourceEnvSchema(componentType);
                    let zocObj = zocker(envSchema.env);
                    switch(componentType) {
                        case 'azuracast':
                            zocObj = zocObj.supply(envSchema.env.shape.AZURA_LISTENERS_NUM, true)
                            break;
                        case 'rocksky':
                            zocObj = zocObj.supply(envSchema.env.shape.SOURCE_ROCKSKY_HANDLE, 'foxxmd.dev')
                            break;
                    }
                    const componentMockData = zocObj.generate();
                    const primitives = generateCommonComponentEnvConfigSchema(envSchema.prefix.toLocaleUpperCase());
                    const primitiveMockData = zocker(primitives).generate();
                    primitiveMockData[`${envSchema.prefix.toLocaleUpperCase()}_ENABLE`] = true;

                    const mockData = {
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
                        configDir: process.cwd(),
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
            let reset: any;
            let ogKeys: string[] = [];

            beforeEach(async function() {
                reset = await withLocalTmpDir({unsafeCleanup: true, postfix: 'clientConfigParse'});
            });

            afterEach(async function() {
                await reset();
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
                    await copyFile(samplePath(componentType), `${componentType}.json`);

                    let fileContents = await readJson(`${componentType}.json`);
                    fileContents = fileContents.filter(x => x.configureAs === undefined || x.configureAs === 'client');
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
                    await copyFile(samplePath(componentType), `${componentType}.json`);
                    const clients = new ScrobbleClients(emitter, new WildcardEmitter<MSBackendEventMap>, {
                        localUrl: new URL('http://example.com'),
                        configDir: process.cwd(),
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
                                        let zocObj = zocker(envSchema.env);
                    switch(componentType) {
                        case 'rocksky':
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_HANDLE, 'foxxmd.dev')
                            zocObj = zocObj.supply(envSchema.env.shape.ROCKSKY_TOKEN, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaWQ')
                            break;
                        case 'discord':
                            zocObj = zocObj.supply(envSchema.env.shape.DISCORD_STATUS_OVERRIDE_ALLOW, 'online')
                    }
                    const componentMockData = zocObj.generate();
                    const primitives = generateCommonComponentEnvConfigSchema(envSchema.prefix.toLocaleUpperCase());
                    const primitiveMockData = zocker(primitives).generate();
                    primitiveMockData[`${envSchema.prefix.toLocaleUpperCase()}_ENABLE`] = true;

                    const mockData = {
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
                        configDir: process.cwd(),
                        version: 'test'
                    },
                    loggerTest);
                    await clients.buildClientsFromConfig()
                    expect(clients.configErrors,`${clients.configErrors.map(x => typeof x === 'string' ? x : JSON.stringify(serializeError(x), undefined, 2)).join('\n')}`).is.empty;
                    expect(clients.instantiateErrors, `${clients.instantiateErrors.map(x => JSON.stringify(serializeError(x), undefined, 2)).join('\n')}`).is.empty;
                    expect(clients.clients).length(1);
                    expect(clients.clients[0].type).eq(componentType);
                });
            }
        });
    });
});

describe('Global ENVs with Config', function () {

    let baseEnvKeys: string[] = [];

    before(function() {
        baseEnvKeys = Array.from(Object.keys(process.env));
    });

    afterEach(function() {
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
            configDir: process.cwd(),
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
            configDir: process.cwd(),
            version: 'test'
        }, loggerTest);
        await sources.buildSourcesFromConfig();

        expect(sources.sources).length(1);
        expect(sources.sources[0].config?.options?.scrobbleThresholds?.percent).to.eq(20);
    });

});