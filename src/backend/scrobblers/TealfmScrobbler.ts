import { childLogger, type Logger, type LogLevel } from "@foxxmd/logging";
import EventEmitter from "events";
import fsPromise from 'node:fs/promises';
import fs from 'node:fs';
import path from 'path';

import { Readable } from 'stream';
import { type PlayObject, type SourcePlayerObj } from "../../core/Atomic.ts";
import { buildTrackString, capitalize } from "../../core/StringUtils.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { type FormatPlayObjectOptions, CALCULATED_PLAYER_STATUSES, type ReportedPlayerStatus, type InternalConfigOptional } from "../common/infrastructure/Atomic.ts";
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.ts';
import { Notifiers } from "../notifier/Notifiers.ts";

import { nowPlayingUpdateByPlayDuration, shouldClearNPStatus } from "./AbstractScrobbleClient.ts";
import { type TealClientConfig } from "../common/infrastructure/config/client/tealfm.ts";
import { ATProtoAppApiClient } from "../common/vendor/atproto/ATProtoAppApiClient.ts";
import { playToRecord, TealApiClient } from "../common/vendor/teal/TealApiClient.ts";
import { playToStatusRecord } from "../common/vendor/teal/TealApiClient.ts";
import { nowPlayingExpirationDuration } from "./AbstractScrobbleClient.ts";
import { recordToPlay } from "../common/vendor/teal/TealApiClient.ts";
import dayjs, { type Dayjs } from "dayjs";
import { isDebugMode } from "../utils.ts";
import { durationToHuman } from '../../core/TimeUtils.ts';
import AbstractHistoricalScrobbleClient from "./AbstractHistoricalScrobbleClient.ts";
import { fromStream } from '@atcute/repo';
import { playToRepositoryCreatePlayHistoricalOpts, type RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import { isAbortError } from "abort-controller-x";
import { FmTealAlphaFeedPlay } from "../common/vendor/teal/lexicons/index.ts";

export default class TealScrobbler extends AbstractHistoricalScrobbleClient {

    requiresAuth = true;
    requiresAuthInteraction = false;
    override nowPlayingIsRealtime: boolean = true;

    declare config: TealClientConfig;

    protected configDir: string;

    client: TealApiClient;

    constructor(name: any, config: TealClientConfig, options: InternalConfigOptional & {[key: string]: any}, emitter: EventEmitter, logger: Logger) {
        super('tealfm', name, config, emitter, logger);
        this.MAX_INITIAL_SCROBBLES_FETCH = 20;
        this.scrobbleDelay = 1500;
        this.supportsNowPlaying = true;
        this.client = new TealApiClient(name, config.data, {...options, logger});
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.nowPlayingMinThreshold = (_) => 20;
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
        await this.client.client.initClient();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if (this.client.client instanceof ATProtoAppApiClient) {
            try {
                return await this.client.client.checkPds(this.config.data);
            } catch (e) {
                throw e;
            }
        } else {
            return true;
        }
    }

    async getAuthorizeUrl(): Promise<string> {
        throw new Error('Oauth is not yet implemented');
    }

    doAuthentication = async () => {

        try {
            const sessionRes = await this.client.client.restoreSession();
            if(sessionRes) {
                return true;
            }
            if(this.client.client instanceof ATProtoAppApiClient) {
                const res = await this.client.client.appLogin();
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
            await this.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            throw e;
        }
    }

    doPlayingNow = async (data: SourcePlayerObj) => {

        const isClearing = shouldClearNPStatus(data);

        // we can avoid additional calls to PDS for clearing a status if the status is about to expire, or is already expired.
        // this will usually happen if a player stops playing the last track in a queue
        // -- worth doing since PDS calls have a daily rate limit
        if(isClearing && (this.statusExpiresSoon() || this.statusAlreadyExpired())) {
            this.npLogger.debug(`Not calling status record update because status  is about to expire (or has already), expiring ${durationToHuman(dayjs.duration(dayjs().diff(this.nowPlayingExpirationDate)))}`);
            return;
        }

        try {
            await this.client.updateStatusRecord(playToStatusRecord(data.play, isClearing, data.position));
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
        await fsPromise.writeFile(filename, Buffer.from(((await this.client.client.getCAR(this.client.client.userData.did)))));
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

        const did = this.client.client.userData.did;

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
                    play = recordToPlay(entry.record as FmTealAlphaFeedPlay.Main, {
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

    protected async syncRecentHistoricalScrobbles(): Promise<[PlayObject[], boolean]> {
        const recentPlays = await this.getScrobblesForTimeRange(undefined);
        const unseenPlays: PlayObject[] = [];
        let syncGapFilled = false;
        for(const p of recentPlays) {
            if(!(await this.playsHistoricalRepo.hasByUid(p.meta.playId))) {
                unseenPlays.push(p);
            } else {
                syncGapFilled = true;
            }
        }
        return [unseenPlays, syncGapFilled];
    }

}

