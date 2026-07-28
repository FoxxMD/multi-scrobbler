import { before, afterEach, describe, it } from 'mocha';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import withLocalTmpDir from 'with-local-tmp-dir';
import {constants, copyFile, access} from 'node:fs/promises';
import path from "path";
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import EventEmitter from "events";
import {loggerTest} from '@foxxmd/logging';
import { clientTypes } from "../../../core/Atomic.ts";
import { projectRootDir } from "../../common/infrastructure/Atomic.ts";
import { sourceTypes } from "../../../core/Atomic.ts";
import { Notifiers } from '../../notifier/Notifiers.ts';
import { difference } from '../../utils.ts';
import { validateSourceJson } from '../../common/infrastructure/config/source/sources.ts';
import { readJson } from '../../utils/DataUtils.ts';
import { prettifyError, ZodError } from 'zod';
import { validateClientJson } from '../../common/infrastructure/config/client/clients.ts';

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

            beforeEach(async function() {
                reset = await withLocalTmpDir({unsafeCleanup: true, postfix: 'sourceConfigParse'});
            });

            afterEach(async function() {
                await reset();
            });


            for(const componentType of sourceTypes) {

                //trueName = componentType;
                it(`Sample ${componentType}.json parses and validates in isolation`, async function () {
                    this.timeout(5000);

                    const emitter = new EventEmitter();
                    await copyFile(samplePath(componentType), `${componentType}.json`);

                    let fileContents = await readJson(`${componentType}.json`);
                    fileContents = fileContents.filter(x => x.configureAs === undefined || x.configureAs === 'source');
                    for (const [i,rawConf] of fileContents.entries()) {
                        try {
                            validateSourceJson(componentType, rawConf);
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

                    const emitter = new EventEmitter();
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
            }
        });

        describe('Client Configs', function () {
            let reset: any;

            beforeEach(async function() {
                reset = await withLocalTmpDir({unsafeCleanup: true, postfix: 'clientConfigParse'});
            });

            afterEach(async function() {
                await reset();
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
                            validateClientJson(componentType, rawConf);
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
                    this.timeout(5000);

                    const emitter = new EventEmitter();
                    await copyFile(samplePath(componentType), `${componentType}.json`);
                    const clients = new ScrobbleClients(emitter, new EventEmitter, {
                        localUrl: new URL('http://example.com'),
                        configDir: process.cwd(),
                        version: 'test'
                    },
                    loggerTest);
                    await clients.buildClientsFromConfig(new Notifiers(new EventEmitter, new EventEmitter, new EventEmitter, loggerTest));
                    expect(clients.clients).length(1);
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
        process.env.MPRIS_ENABLE = 'true';

        const emitter = new EventEmitter();
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
        process.env.MPRIS_ENABLE = 'true';

        const emitter = new EventEmitter();
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