import { after, before, afterEach, describe, it } from 'mocha';
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import withLocalTmpDir from 'with-local-tmp-dir';
import {constants, copyFile, access} from 'node:fs/promises';
import path from "path";
import {projectDir} from '../../common/index.js';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.js';
import ScrobbleSources from '../../sources/ScrobbleSources.js';
import EventEmitter from "events";
import {loggerTest, loggerDebug} from '@foxxmd/logging';
import { clientTypes, SourceType, sourceTypes } from '../../common/infrastructure/Atomic.js';
import { Notifiers } from '../../notifier/Notifiers.js';
import { difference, intersect } from '../../utils.js';

chai.use(asPromised);

const samplePath = (name: string) => path.resolve(projectDir, 'config', `${name}.json.example`);

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
                reset = await withLocalTmpDir({unsafeCleanup: true});
            });

            afterEach(async function() {
                await reset();
            });

            for(const componentType of sourceTypes) {

                //trueName = componentType;
                it(`Sample ${componentType}.json parses and validates`, async function () {
                    this.timeout(5000);

                    let emitter = new EventEmitter();
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
                reset = await withLocalTmpDir({unsafeCleanup: true});
            });

            afterEach(async function() {
                await reset();
            });

            for(const componentType of clientTypes) {
                it(`Sample ${componentType}.json parses and validates`, async function () {
                    this.timeout(5000);

                    let emitter = new EventEmitter();
                    await copyFile(samplePath(componentType), `${componentType}.json`);
                    const clients = new ScrobbleClients(emitter, new EventEmitter, new URL('http://example.com'), process.cwd(), loggerTest);
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