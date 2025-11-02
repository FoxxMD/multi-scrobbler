import { loggerTest } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import clone from 'clone';
import dayjs from "dayjs";
import EventEmitter from "events";
import { describe, it, beforeEach } from 'mocha';
import { PlayObject } from "../../../core/Atomic.js";
import { TransferManager } from "../../transfer/TransferManager.js";
import { TransferJob } from "../../transfer/TransferJob.js";
import { generatePlay, generatePlays, normalizePlays } from "../utils/PlayTestUtils.js";
import ScrobbleSources from "../../sources/ScrobbleSources.js";
import ScrobbleClients from "../../scrobblers/ScrobbleClients.js";
import AbstractScrobbleClient from "../../scrobblers/AbstractScrobbleClient.js";
import AbstractSource from "../../sources/AbstractSource.js";
import { Notifiers } from "../../notifier/Notifiers.js";

chai.use(asPromised);

const emitter = new EventEmitter();

// Test source that supports getRecentlyPlayed
class TestTransferSource extends AbstractSource {
    testPlays: PlayObject[] = [];

    constructor(name: string, plays: PlayObject[] = []) {
        super('test', name, {}, { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' }, emitter);
        this.testPlays = plays;
        this.canBacklog = false;
        // Mark as ready
        this.buildOK = true;
        this.connectionOK = true;
        this.requiresAuth = false;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        return true;
    }

    async getRecentlyPlayed(options: { limit?: number } = {}): Promise<PlayObject[]> {
        const { limit = 200 } = options;
        return this.testPlays.slice(0, limit);
    }
}

// Test client that supports time-range fetching
class TestTransferClient extends AbstractScrobbleClient {
    testScrobbles: PlayObject[] = [];
    scrobbledPlays: PlayObject[] = [];

    constructor(name: string, supportsTimeRange: boolean = true) {
        super('test', name, {}, new Notifiers(emitter, new EventEmitter(), new EventEmitter(), loggerTest), emitter, loggerTest);
        this.requiresAuth = false;
        this.requiresAuthInteraction = false;
        // Mark as ready
        this.buildOK = true;
        this.connectionOK = true;

        if (supportsTimeRange) {
            // Add the method to support time-range fetching
            (this as any).getScrobblesForTimeRange = async (fromDate: any, toDate: any, limit: number) => {
                return this.testScrobbles.filter(s => {
                    const playDate = s.data.playDate;
                    if (!playDate) return false;
                    return playDate.isAfter(fromDate) && playDate.isBefore(toDate);
                });
            };
        }
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        return true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        return true;
    }

    async doScrobble(playObj: PlayObject): Promise<PlayObject> {
        this.scrobbledPlays.push(playObj);
        return playObj;
    }

    async getRecentlyPlayed(limit: number): Promise<PlayObject[]> {
        return this.testScrobbles.slice(0, limit);
    }

    protected async getScrobblesForRefresh(limit: number): Promise<PlayObject[]> {
        // Return testScrobbles for duplicate detection
        return this.testScrobbles;
    }

    protected async doParseCache() {
        await this.cache.init();
        return super.doParseCache();
    }
}

describe('TransferManager', function() {

    describe('Validation', function() {

        let transferManager: TransferManager;
        let sources: ScrobbleSources;
        let clients: ScrobbleClients;

        beforeEach(async function() {
            sources = new ScrobbleSources(emitter, {
                localUrl: new URL('https://example.com'),
                configDir: 'fake',
                version: 'test'
            }, loggerTest);
            clients = new ScrobbleClients(emitter, new EventEmitter(), new URL('https://example.com'), 'fake', loggerTest);
            transferManager = new TransferManager(sources, clients, loggerTest);

            const source = new TestTransferSource('testSource');
            sources.sources.push(source);

            const client = new TestTransferClient('testClient', true);
            await client.initialize();
            clients.clients.push(client);
        });

        it('Rejects future fromDate', async function() {
            await assert.isRejected(
                transferManager.startTransfer({
                    sourceName: 'testSource',
                    clientName: 'testClient',
                    fromDate: dayjs().add(1, 'day').format('YYYY-MM-DD')
                }),
                /fromDate cannot be in the future/
            );
        });

        it('Rejects future toDate', async function() {
            await assert.isRejected(
                transferManager.startTransfer({
                    sourceName: 'testSource',
                    clientName: 'testClient',
                    toDate: dayjs().add(1, 'day').format('YYYY-MM-DD')
                }),
                /toDate cannot be in the future/
            );
        });

        it('Rejects backwards date range (fromDate > toDate)', async function() {
            await assert.isRejected(
                transferManager.startTransfer({
                    sourceName: 'testSource',
                    clientName: 'testClient',
                    fromDate: '2025-01-15',
                    toDate: '2025-01-10'
                }),
                /fromDate must be before toDate/
            );
        });

        it('Rejects client without time-range support', async function() {
            const unsupportedClient = new TestTransferClient('unsupportedClient', false);
            await unsupportedClient.initialize();
            clients.clients.push(unsupportedClient);

            await assert.isRejected(
                transferManager.startTransfer({
                    sourceName: 'testSource',
                    clientName: 'unsupportedClient',
                    playCount: 10
                }),
                /does not support time-range fetching/
            );
        });

        it('Accepts valid transfer options with playCount', async function() {
            const transferId = await transferManager.startTransfer({
                sourceName: 'testSource',
                clientName: 'testClient',
                playCount: 10
            });

            assert.isString(transferId);
            assert.isNotEmpty(transferId);
        });

        it('Accepts valid transfer options with date range', async function() {
            const transferId = await transferManager.startTransfer({
                sourceName: 'testSource',
                clientName: 'testClient',
                fromDate: '2025-01-01',
                toDate: '2025-01-10'
            });

            assert.isString(transferId);
            assert.isNotEmpty(transferId);
        });
    });

});


