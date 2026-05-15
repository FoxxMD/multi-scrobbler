import { childLogger, Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import fsPromise from 'node:fs/promises';
import fs from 'node:fs';
import path from 'path';

import { Readable } from 'stream';
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfigOptional } from "../common/infrastructure/Atomic.js";
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.js';
import { Notifiers } from "../notifier/Notifiers.js";

import { ScrobbleRecord, TealClientConfig } from "../common/infrastructure/config/client/tealfm.js";
import { BlueSkyAppApiClient } from "../common/vendor/bluesky/BlueSkyAppApiClient.js";
import { BlueSkyOauthApiClient } from "../common/vendor/bluesky/BlueSkyOauthApiClient.js";
import { AbstractBlueSkyApiClient, playToRecord, recordToPlay } from "../common/vendor/bluesky/AbstractBlueSkyApiClient.js";
import AbstractHistoricalScrobbleClient from "./AbstractHistoricalScrobbleClient.js";
import dayjs from "dayjs";
import { fromStream } from '@atcute/repo';
import { playToRepositoryCreatePlayHistoricalOpts, RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.js";
import { durationToHuman, isDebugMode } from "../utils.js";
import { isAbortError } from "abort-controller-x";

export default class TealScrobbler extends AbstractHistoricalScrobbleClient {

    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: TealClientConfig;

    protected configDir: string;

    client: AbstractBlueSkyApiClient;

    constructor(name: any, config: TealClientConfig, options: InternalConfigOptional & {[key: string]: any}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('tealfm', name, config, notifier, emitter, logger);
        this.MAX_INITIAL_SCROBBLES_FETCH = 20;
        this.scrobbleDelay = 1500;
        this.supportsNowPlaying = false;
        if(config.data.appPassword !== undefined) {
            this.client = new BlueSkyAppApiClient(name, config.data, {...options, logger});
            this.requiresAuthInteraction = false;
        } else if(config.data.baseUri !== undefined) {
            this.client = new BlueSkyOauthApiClient(name, config.data, {...options, logger});
        } else {
            throw new Error(`Must define either 'baseUri' or 'appPassword' in configuration!`);
        }
        this.configDir = options.configDir;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => recordToPlay(obj);

    public playToClientPayload(playObject: PlayObject): object {
        return playToListenPayload(playObject);
    }


    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                identifier,
            } = {}
        } = this.config;
        if (identifier === undefined) {
            throw new Error('Must provide an identifier');
        }
        await this.client.initClient();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if (this.client instanceof BlueSkyAppApiClient) {
            try {
                return await this.client.checkPds();
            } catch (e) {
                throw e;
            }
        } else {
            return true;
        }
    }

    async getAuthorizeUrl(): Promise<string> {
        return await (this.client as BlueSkyOauthApiClient).createAuthorizeUrl(this.config.data.identifier);
    }

    doAuthentication = async () => {

        try {
            const sessionRes = await this.client.restoreSession();
            if(sessionRes) {
                return true;
            }
            if(this.client instanceof BlueSkyAppApiClient) {
                const res = await this.client.appLogin();
                return res;
            }
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with ATProto API');
            }
            throw e;
        }
    }

    getScrobblesForTimeRange = async (_) => {
        try {
            const {data} = await this.client.getPagelessTimeRangeListens({limit: 100})
            return data;
        } catch (e) {
            throw new Error('Error occurred while trying to fetch records', {cause: e});
        }
    }

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        try {
            const res = await this.client.createScrobbleRecord(playToRecord(playObj))
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return res;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            throw e;
        }
    }

    protected async doHydrateHistoricalScrobbles(opts: {allowFailures?: boolean, signal?: AbortSignal } = {}) {
        const {
            allowFailures = false,
            signal
        } = opts;
        let file: string;
        try {
            file = await this.fetchCarToFile();
            signal?.throwIfAborted();
        } catch (e) {
            throw new Error('Failed to fetch CAR repo file', {cause: e});
        }

        try {
            await this.parseScrobblesFromCar(file, 100, {allowFailures, logger: childLogger(this.logger, ['Historical Plays']), signal});
        } catch (e) {
            throw new Error('Failed to convert CAR without any error', {cause: e});
        } finally {
            await fsPromise.rm(file);
        }
    }

    async fetchCarToFile() {
        const filename = path.resolve(this.configDir, `${this.getSafeExternalId()}-${dayjs().unix()}.car`);
        await fsPromise.writeFile(filename, Buffer.from(((await this.client.getCAR()).data)));
        return filename;
    }

    async parseScrobblesFromCar(filename: string, batchSize: number, opts: {allowFailures?: boolean, logger?: Logger, signal?: AbortSignal} = {}) {

        const {
            allowFailures = false,
            logger = this.logger,
            signal
        } = opts;

        const stream = Readable.toWeb(fs.createReadStream(filename));

        await using repo = fromStream(stream);

        const did = this.client?.agent?.sessionManager?.did;

        let batch: RepositoryCreatePlayHistoricalOpts[] = [];
        let allGood = true;
        let count = 0;
        let persisted = 0;
        const start = dayjs();

        logger.info('Starting CAR conversion to historical plays...');

        for await (const entry of repo) {
            if(entry.collection === 'fm.teal.alpha.feed.play') {
                let play: PlayObject;
                try {
                    play = recordToPlay(entry.record as ScrobbleRecord, {
                        web: did !== undefined ? `at://did:plc:${did}/fm.teal.alpha.feed.play/${entry.rkey}` : undefined,
                        playId: entry.rkey,
                        user: did
                    });
                    if(isDebugMode()) {
                        logger.trace(`(${count}) rKey ${entry.rkey} => ${buildTrackString(play)}`);
                    }
                    count++;
                    if(count % (batchSize * 5) === 0) {
                        logger.debug(`Processed ${count} records`);
                        signal?.throwIfAborted();
                    }
                } catch (e) {
                    if(isAbortError(e)) {
                        throw e;
                    }
                    if(allowFailures) {
                        this.logger.warn(new Error(`Failed to convert record ${entry.rkey} to Play but will continue`, {cause: e}));
                        continue;
                    } else {
                        throw new Error(`Failed to convert record ${entry.rkey} to Play`, {cause: e});
                    }
                }

                const existing = await this.playsHistoricalRepo.hasByUid(entry.rkey);
                if(!existing) {
                    batch.push(playToRepositoryCreatePlayHistoricalOpts({play}));
                }
                if(batch.length >= batchSize) {
                    try {
                        const [res, valid] = await this.createHistoricalPlays(batch, opts);
                        persisted += valid;
                        if(!res) {
                            allGood = false;
                        }
                    } catch (e) {
                        throw e;
                    }
                    batch = [];
                }
            }
        }

        logger.debug('Reached end of CAR file');
        if(batch.length > 0) {
            logger.debug(`Persisting remaining ${batch.length} records...`);
            try {
                const [res, valid] = await this.createHistoricalPlays(batch, opts);
                persisted += valid;
                if(!res) {
                    allGood = false;
                }
            } catch (e) {
                throw e;
            }
        }
        logger.info(`Completed CAR conversion: Result ${allGood ? 'OK' : 'Some Errors'} in ${durationToHuman(dayjs.duration(dayjs().diff(start)))} | Records ${count} | Persisted ${persisted}`)
    }

    async createHistoricalPlays(batch: RepositoryCreatePlayHistoricalOpts[], opts: {allowFailures?: boolean, logger?: Logger, signal?: AbortSignal} = {}): Promise<[boolean, number]> {
        const {
            allowFailures = false,
            logger = this.logger,
            signal
        } = opts;
        try {
            await this.playsHistoricalRepo.createPlays(batch);
            return [true, batch.length];
        } catch (e) {
            logger.warn(`Failed to persist batch of ${batch} plays, trying individually...`);
        }
        signal?.throwIfAborted();

        let valid = 0;
        for(const p of batch) {
            try {
                await this.playsHistoricalRepo.createPlays([p]);
                valid++;
            } catch (e) {
                if(allowFailures) {
                    logger.warn(p.play,`Failed to persist play from record with rKey ${p.play.meta.playId} => ${buildTrackString(p.play)}`);
                    logger.warn(e);
                } else {
                    logger.error(p.play,`Failed to persist play from record with rKey ${p.play.meta.playId} => ${buildTrackString(p.play)}`);
                    throw e;
                }
            }
            signal?.throwIfAborted();
        }

        return [false, valid];
    }
}

