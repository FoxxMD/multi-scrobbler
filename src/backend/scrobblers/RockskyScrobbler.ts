import { type Logger } from "@foxxmd/logging";
import type EventEmitter from "events";
import { COMPONENT_AUTH_TYPE, type ComponentAuthType, type QueueContext } from "../../core/Atomic.ts";
import type { PlayObject, SourcePlayerObj } from "../../core/PlaySchema.ts";
import { capitalize } from "../../core/StringUtils.ts";
import { buildTrackString } from "../../core/MusicMetadata.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import type {FormatPlayObjectOptions, InternalConfigOptional} from "../common/infrastructure/Atomic.ts";
import { ListenbrainzApiClient } from "../common/vendor/ListenbrainzApiClient.ts";
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.ts';
import type {ListenPayload} from '../../core/vendor/listenbrainz/interfaces.ts';

import { isDebugMode } from "../utils.ts";
import { durationToHuman } from '../../core/TimeUtils.ts';
import { indexRockskyRecord, playToRockskyClientRecord, RockSkyApiClient, rockskyScrobbleToPlay, type RockskyScrobble, WRITE_PROBE_INTERVAL } from "../common/vendor/RockSkyApiClient.ts";
import type {RockSkyClientConfig} from "../common/infrastructure/config/client/rocksky.ts";
import AbstractHistoricalScrobbleClient, { inRanges, type ParseCarOpts } from "./AbstractHistoricalScrobbleClient.ts";
import { fromStream } from '@atcute/repo';
import fs from 'node:fs';
import dayjs from "dayjs";
import { Readable } from 'stream';
import { ATProtoUnauthenticatedApiClient } from "../common/vendor/atproto/ATProtoUnauthenticatedApiClient.ts";
import { playToRepositoryCreatePlayHistoricalOpts, type RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import { isAbortError } from "abort-controller-x";
import { shouldClearNPStatus } from "./AbstractScrobbleClient.ts";
import { toWriteBudget, type WriteBudget } from "../common/vendor/atproto/WriteBudget.ts";

export default class RockskyScrobbler extends AbstractHistoricalScrobbleClient {

    api: RockSkyApiClient;
    override authType: ComponentAuthType = COMPONENT_AUTH_TYPE.unattended;
    requiresAuth = true;
    requiresAuthInteraction = false;
    override nowPlayingIsRealtime: boolean = true;

    declare config: RockSkyClientConfig;

    protected dataDir: string;
    // because rocksky scrobble peristence is async, does not return a TID, and may be modified server-side
    // we don't want to add our scrobble payload as a source-of-truth historical play because it may end up
    // looking different when we sync historical from car/api call
    //
    // we already keep a copy of what was scrobbled in the play table and that should be enough to prevent dupes
    // without having to result to historical querying
    protected override addScrobbleToHistorical: boolean = false;

    constructor(name: any, config: RockSkyClientConfig, options: InternalConfigOptional & { [key: string]: any }, emitter: EventEmitter, logger: Logger) {
        super('rocksky', name, config, emitter, logger);
        this.api = new RockSkyApiClient(name, { ...config.data, ...config.options }, { logger: this.logger, configDir: options.dataDir });
        // https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(user_name)-listens
        // 1000 is way too high. maxing at 100
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
        this.supportsNowPlaying = true;
        // PDS rate limit for operations is ~2/sec
        this.scrobbleDelay = 2000;
        this.dataDir = options.dataDir;
        if(config.options?.keepAllHistory) {
            this.historicalWindowMs = undefined;
        }
        this.existingPlayOpts = {
            logger: this.dupeLogger,
            transformRules: this.transformRules,
            transformPlay: this.transformPlay,
            existingSubmitted: this.findExistingSubmittedPlayObj,
            existingExternal: async (play) => {
                const {userData} = this.api;
                if(userData === undefined) {
                    return {match: false, reason: 'atproto identifier is not resolved so existing scrobble records cannot be checked'};
                }
                const {title, artist, album, timestamp} = playToRockskyClientRecord(play);
                if(album === undefined || timestamp === undefined) {
                    // rocksky requires album so a record without one could not have been scrobbled
                    return {match: false};
                }
                const existingUri = await this.api.rsIndex.scrobbleUri(userData.did, title, artist, album, timestamp);
                if(existingUri) {
                    return {
                        match: true,
                        reason: 'matched existing scrobble record URI',
                        data: existingUri
                    }
                }
                if(this.api.rsAgent === undefined) {
                    return {match: false, reason: 'must be using PDS auth to use local mirror, no matches will ever be found'}
                }
                return {match: false};
            }
        }
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => ListenbrainzApiClient.formatPlayObj(obj, options);

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                appPassword,
                token
            } = {}
        } = this.config;
        if (appPassword === undefined && token === undefined) {
            throw new Error('Must provide an App Password or Access Token');
        }
        if(appPassword === undefined && token !== undefined) {
            this.logger.warn('Access Token authentication is DEPRECATED and will be removed in a future release. Please switch to handle/appPassword auth as soon as possible.');
        }
        if((this.config.options?.scrobbleInterval ?? this.scrobbleDelay) < this.scrobbleDelay) {
            this.logger.warn(`Scrobble interval is LOWER than recommended ${this.scrobbleDelay}ms . You should only be using this if you are sure your PDS allows higher request rates.`)
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

    getScrobblesForTimeRange = async (_: any) => {
        return await this.api.getRecentlyPlayed(this.MAX_INITIAL_SCROBBLES_FETCH);
    }

    public playToClientPayload(playObj: PlayObject): ListenPayload {
        return playToListenPayload(playObj);
    }

    /** Probed, because we can't see the headers of the Rocksky SDK's own writes */
    override async writeBudget(): Promise<WriteBudget | undefined> {
        let budget = toWriteBudget(await this.api.getWriteRateLimit(), this.config.options);
        // remaining only goes down until the limit resets, so once both reserves are reached they stay reached without probing
        const reached = budget !== undefined && budget.remaining <= Math.min(budget.reserve, budget.exportReserve);
        if(budget === undefined || (!reached && Date.now() - budget.at >= WRITE_PROBE_INTERVAL)) {
            await this.api.probeWriteRateLimit();
            budget = toWriteBudget(await this.api.getWriteRateLimit(), this.config.options);
        }
        return budget;
    }

    doScrobble = async (playObj: PlayObject, context?: QueueContext) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const {isRetry = false} = context ?? {};

        try {
            const result = await this.api.submitListen(playObj, { log: isDebugMode(), force: isRetry === true });

            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return result;
        } catch (e: any) {
            await this.notifyScrobbleFailure(playObj, { title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error' });
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
            await this.api.updateNowPlaying(isClearing ? undefined : data.play);
        } catch (e) {
            throw e;
        }
    }

    protected getMirrorAccount(): string | undefined {
        return this.api.userData?.did;
    }

    protected async downloadCar(filename: string) {
        // TODO use `since` to get CAR diff instead of entire repo
        const {userData} = this.api;
        if(userData === undefined) {
            throw new Error('Cannot fetch CAR because atproto identifier has not been resolved');
        }
        const atClient = new ATProtoUnauthenticatedApiClient('rocksky', { handleData: userData, identifier: this.config.data.handle }, { logger: this.logger });
        await atClient.initClient();
        await atClient.getCARToFile(userData.did, filename);
    }

    async parseScrobblesFromCar(filename: string, batchSize: number, opts: ParseCarOpts = {}) {

        if(this.api.userData === undefined) {
            throw new Error('Cannot parse CAR because atproto identifier has not been resolved');
        }
        const {did} = this.api.userData;

        // the SDK index (exact-match dupe checks) is only used with PDS auth
        const index = this.api.rsAgent !== undefined ? this.api.rsIndex : undefined;

        const {
            allowFailures = false,
            logger = this.logger,
            signal,
            ranges
        } = opts;

        const stream = Readable.toWeb(fs.createReadStream(filename));

        await using repo = fromStream(stream as ReadableStream<Uint8Array>);

        let batch: RepositoryCreatePlayHistoricalOpts[] = [];
        let allGood = true;
        let count = 0;
        let persisted = 0;
        const start = dayjs();

        logger.info('Starting CAR conversion to historical plays...');

        for await (const entry of repo) {
            if (index !== undefined) {
                await indexRockskyRecord(index, did, entry.collection, entry.rkey, entry.record as Record<string, unknown>);
            }
            if (entry.collection === 'app.rocksky.scrobble') {
                let play: PlayObject;
                try {
                    play = rockskyScrobbleToPlay(entry.record as RockskyScrobble, {user: did, playId: entry.rkey, web: `https://atproto.at/viewer?uri=${did}/app.rocksky.scrobble/${entry.rkey}`})
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

                if(ranges !== undefined && !inRanges(play.data.playDate?.valueOf(), ranges)) {
                    continue;
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

    protected async doSyncRecentHistoricalScrobbles(): Promise<[PlayObject[], boolean]> {
        const recentPlays = await this.getScrobblesForTimeRange(undefined);
        const unseenPlays: PlayObject[] = [];
        let syncGapFilled = false;
        for (const p of recentPlays) {
            if(p.meta.playId === undefined) {
                this.logger.warn(`Cannot determine if play has been seen because it has no playId, skipping => ${buildTrackString(p)}`);
                continue;
            }
            if(!(await this.playsHistoricalRepo.hasByUid(p.meta.playId))) {
                unseenPlays.push(p);
            } else {
                syncGapFilled = true;
            }
        }
        return [unseenPlays, syncGapFilled];
    }
}
