import { Logger, LogLevel } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions, CALCULATED_PLAYER_STATUSES, ReportedPlayerStatus } from "../common/infrastructure/Atomic.js";
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.js';
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration, shouldClearNPStatus } from "./AbstractScrobbleClient.js";
import { TealClientConfig } from "../common/infrastructure/config/client/tealfm.js";
import { BlueSkyAppApiClient } from "../common/vendor/bluesky/BlueSkyAppApiClient.js";
import { BlueSkyOauthApiClient } from "../common/vendor/bluesky/BlueSkyOauthApiClient.js";
import { AbstractBlueSkyApiClient, listRecordToPlay, nowPlayingExpirationDuration, playToRecord, playToStatusRecord, recordToPlay } from "../common/vendor/bluesky/AbstractBlueSkyApiClient.js";
import dayjs, { Dayjs } from "dayjs";
import { durationToHuman } from "../utils.js";

export default class TealScrobbler extends AbstractScrobbleClient {

    requiresAuth = true;
    requiresAuthInteraction = false;
    override nowPlayingIsRealtime: boolean = true;
    protected lastExpirationDate: Dayjs;

    declare config: TealClientConfig;

    client: AbstractBlueSkyApiClient;

    constructor(name: any, config: TealClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('tealfm', name, config, notifier, emitter, logger);
        this.MAX_INITIAL_SCROBBLES_FETCH = 20;
        this.scrobbleDelay = 1500;
        this.supportsNowPlaying = true;
        if(config.data.appPassword !== undefined) {
            this.client = new BlueSkyAppApiClient(name, config.data, {...options, logger});
            this.requiresAuthInteraction = false;
        } else if(config.data.baseUri !== undefined) {
            this.client = new BlueSkyOauthApiClient(name, config.data, {...options, logger});
        } else {
            throw new Error(`Must define either 'baseUri' or 'appPassword' in configuration!`);
        }
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.nowPlayingMinThreshold = (_) => 20;
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
                return await this.client.appLogin();
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

    doPlayingNow = async (data: SourcePlayerObj) => {

        const isClearing = shouldClearNPStatus(data);

        // we can avoid additional calls to PDS for clearing a status if the status is about to expire, or is already expired.
        // this will usually happen if a player stops playing the last track in a queue
        // -- worth doing since PDS calls have a daily rate limit
        if(isClearing && (this.statusAlreadyExpired() || this.statusAlreadyExpired())) {
            this.npLogger.debug(`Not calling status record update because status  is about to expire (or has already), expiring ${durationToHuman(dayjs.duration(dayjs().diff(this.lastExpirationDate)))}`);
            return;
        }

        try {
            await this.client.updateStatusRecord(playToStatusRecord(data.play, isClearing, data.position));
            if(!isClearing) {
                this.lastExpirationDate = dayjs().add(nowPlayingExpirationDuration(data));
            }
        } catch (e) {
            throw e;
        }
    }

    protected statusExpiresSoon = () => {
        if(this.lastExpirationDate === undefined) {
            return false;
        }
        // may want to make this configurable in the future?
        return Math.abs(dayjs().diff(this.lastExpirationDate, 's')) < 15;
    }
    protected statusAlreadyExpired = () => {
        if(this.lastExpirationDate === undefined) {
            return false;
        }
        return dayjs().isAfter(this.lastExpirationDate);
    }
}

