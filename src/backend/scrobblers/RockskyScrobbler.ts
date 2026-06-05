import { childLogger, Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, InternalConfigOptional } from "../common/infrastructure/Atomic.js";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient.js";
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.js';
import { ListenPayload } from '../common/vendor/listenbrainz/interfaces.js';
import { Notifiers } from "../notifier/Notifiers.js";

import { durationToHuman, isDebugMode } from "../utils.js";
import { RockSkyApiClient, rockskyScrobbleToPlay, SubmitResponse } from "../common/vendor/RockSkyApiClient.js";
import { RockSkyClientConfig } from "../common/infrastructure/config/client/rocksky.js";
import { ScrobbleSubmitError } from "../common/errors/MSErrors.js";
import AbstractHistoricalScrobbleClient from "./AbstractHistoricalScrobbleClient.js";
import { fromStream } from '@atcute/repo';
import fsPromise from 'node:fs/promises';
import fs from 'node:fs';
import path from 'path';
import dayjs from "dayjs";
import { Readable } from 'stream';
import { ATProtoUnauthenticatedApiClient } from "../common/vendor/atproto/ATProtoUnauthenticatedApiClient.js";
import { playToRepositoryCreatePlayHistoricalOpts, RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.js";
import { isAbortError } from "abort-controller-x";

export default class RockskyScrobbler extends AbstractHistoricalScrobbleClient {

    api: RockSkyApiClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: RockSkyClientConfig;

    protected configDir: string;
    // because rocksky scrobble peristence is async, does not return a TID, and may be modified server-side
    // we don't want to add our scrobble payload as a source-of-truth historical play because it may end up
    // looking different when we sync historical from car/api call
    //
    // we already keep a copy of what was scrobbled in the play table and that should be enough to prevent dupes
    // without having to result to historical querying
    protected override addScrobbleToHistorical: boolean = false;

    constructor(name: any, config: RockSkyClientConfig, options: InternalConfigOptional & { [key: string]: any }, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('rocksky', name, config, notifier, emitter, logger);
        this.api = new RockSkyApiClient(name, { ...config.data, ...config.options }, { logger: this.logger });
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
        this.supportsNowPlaying = false;
        // PDS rate limit for operations is ~2/sec
        this.scrobbleDelay = 2000;
        this.configDir = options.configDir;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => ListenbrainzApiClient.formatPlayObj(obj, options);

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                key,
                token,
            } = {}
        } = this.config;
        if (key === undefined && token === undefined) {
            throw new Error('Must provide an API Key or Access Token');
        }
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        await this.api.testConnection();
        return true;
    }

    doAuthentication = async () => {

        try {
            return await this.api.testAuth();
        } catch (e) {
            if (isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Rocksky API');
            }
            throw e;
        }
    }

    getScrobblesForTimeRange = async (_) => {
        return await this.api.getRecentlyPlayed(this.MAX_INITIAL_SCROBBLES_FETCH);
    }

    public playToClientPayload(playObj: PlayObject): ListenPayload {
        return playToListenPayload(playObj);
    }

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        try {
            const result = await this.api.submitListen(playObj, { log: isDebugMode() });

            if (this.api.isLzMode() && ((result.response as SubmitResponse).payload?.ignored_listens ?? 0) > 0) {
                throw new ScrobbleSubmitError('Scrobble was successfully submitted but Rocksky ignored it', { showStopper: false, responseBody: result.response, payload: result.payload });
            }

            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return result;
        } catch (e) {
            await this.notifier.notify({ title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error' });
            throw e;
        }
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        try {
            await this.api.submitListen(data.play, { listenType: 'playing_now' });
        } catch (e) {
            throw e;
        }
    }

    protected async doHydrateHistoricalScrobbles(opts: {allowFailures?: boolean, signal?: AbortSignal } = {}) {
        const logger =  childLogger(this.logger, ['Historical Plays']);
        const {
            allowFailures = false,
            signal
        } = opts;
        let file: string;
        try {
            logger.verbose('Fetching scrobbles from PDS...');
            file = await this.fetchCarToFile();
            signal?.throwIfAborted();
        } catch (e) {
            throw new Error('Failed to fetch repo CAR', {cause: e});
        }

        try {
            await this.parseScrobblesFromCar(file, 100, {allowFailures, logger: logger, signal});
        } catch (e) {
            throw new Error('Failed to convert CAR without any error', {cause: e});
        } finally {
            await fsPromise.rm(file);
        }
    }

    async fetchCarToFile() {
        // TODO use `since` to get CAR diff instead of entire repo
        // can use last import date from migrations table
        const filename = path.resolve(this.configDir, `${this.getSafeExternalId()}-${dayjs().unix()}.car`);
        const atClient = new ATProtoUnauthenticatedApiClient('rocksky', { handleData: this.api.userData, identifier: this.api.userData.handle }, { logger: this.logger });
        await atClient.initClient();
        await fsPromise.writeFile(filename, Buffer.from(await atClient.getCAR(this.api.userData.did)));
        return filename;
    }

    async parseScrobblesFromCar(filename: string, batchSize: number, opts: { allowFailures?: boolean, logger?: Logger, signal?: AbortSignal } = {}) {

        const {
            allowFailures = false,
            logger = this.logger,
            signal
        } = opts;

        const stream = Readable.toWeb(fs.createReadStream(filename));

        await using repo = fromStream(stream);

        let batch: RepositoryCreatePlayHistoricalOpts[] = [];
        let allGood = true;
        let count = 0;
        let persisted = 0;
        const start = dayjs();

        logger.info('Starting CAR conversion to historical plays...');

        for await (const entry of repo) {
            if (entry.collection === 'app.rocksky.scrobble') {
                let play: PlayObject;
                try {
                    play = rockskyScrobbleToPlay(entry.record, {user: this.api.userData.did, playId: entry.rkey, web: `${this.api.userData.did}/app.rocksky.scrobble/${entry.rkey}`})
                    if (isDebugMode()) {
                        logger.trace(`(${count}) rKey ${entry.rkey} => ${buildTrackString(play)}`);
                    }
                    count++;
                    if (count % (batchSize * 5) === 0) {
                        logger.debug(`Processed ${count} records`);
                        signal?.throwIfAborted();
                    }
                } catch (e) {
                    if (isAbortError(e)) {
                        throw e;
                    }
                    if (allowFailures) {
                        this.logger.warn(new Error(`Failed to convert record ${entry.rkey} to Play but will continue`, { cause: e }));
                        continue;
                    } else {
                        throw new Error(`Failed to convert record ${entry.rkey} to Play`, { cause: e });
                    }
                }

                const existing = await this.playsHistoricalRepo.hasByUid(entry.rkey);
                if (!existing) {
                    batch.push(playToRepositoryCreatePlayHistoricalOpts({ play }));
                }
                if (batch.length >= batchSize) {
                    try {
                        const [res, valid] = await this.createHistoricalPlays(batch, opts);
                        persisted += valid;
                        if (!res) {
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
        if (batch.length > 0) {
            logger.debug(`Persisting remaining ${batch.length} records...`);
            try {
                const [res, valid] = await this.createHistoricalPlays(batch, opts);
                persisted += valid;
                if (!res) {
                    allGood = false;
                }
            } catch (e) {
                throw e;
            }
        }
        logger.info(`Completed CAR conversion: Result ${allGood ? 'OK' : 'Some Errors'} in ${durationToHuman(dayjs.duration(dayjs().diff(start)))} | Records ${count} | Persisted ${persisted}`)
    }

    protected async syncRecentHistoricalScrobbles(): Promise<PlayObject[]> {
        const recentPlays = await this.getScrobblesForTimeRange(undefined);
        const unseenPlays: PlayObject[] = [];
        for (const p of recentPlays) {
            if(!(await this.playsHistoricalRepo.hasByUid(p.meta.playId))) {
                unseenPlays.push(p);
            }
        }
        return unseenPlays;
    }
}
