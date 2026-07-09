import { type Logger } from "@foxxmd/logging";
import dayjs, { type Dayjs } from "dayjs";
import EventEmitter from "events";
import { type PlayObject, type SourcePlayerObj } from "../../core/Atomic.ts";
import { buildTrackString, capitalize } from "../../core/StringUtils.ts";
import { isNodeNetworkException } from "../common/errors/NodeErrors.ts";
import { type FormatPlayObjectOptions, type InternalConfigOptional, type TimeRangeListensFetcher } from "../common/infrastructure/Atomic.ts";
import { type LastfmClientConfig } from "../common/infrastructure/config/client/lastfm.ts";
import LastfmApiClient, { LastFMIgnoredScrobble, playToClientPayload, formatPlayObj } from "../common/vendor/LastfmApiClient.ts";
import { Notifiers } from "../notifier/Notifiers.ts";
import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration, playerInNPPlayingOnlyState } from "./AbstractScrobbleClient.ts";
import { findCauseByReference } from "../utils/ErrorUtils.ts";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.ts";

export default class LastfmScrobbler extends AbstractScrobbleClient {

    api: LastfmApiClient;
    requiresAuth = true;
    requiresAuthInteraction = true;
    upstreamType: string = 'Last.fm';
    getScrobblesForTimeRange: TimeRangeListensFetcher

    declare config: LastfmClientConfig;

    constructor(name: any, config: LastfmClientConfig, options: InternalConfigOptional & {[key: string]: any}, emitter: EventEmitter, logger: Logger, type = 'lastfm') {
        super(type, name, config, emitter, logger);
        this.api = new LastfmApiClient(name, config.data, {...options, logger});
        // https://www.last.fm/api/show/user.getRecentTracks
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
        this.supportsNowPlaying = true;
        // last.fm shows Now Playing for the same time as the duration of the track being submitted
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => formatPlayObj(obj, options);

    protected async doBuildInitData(): Promise<true | string | undefined> {
        await this.api.initialize();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await this.api.testConnection();
            return true;
        } catch (e) {
            throw e;
        }
    }

    doAuthentication = async () => {
        try {
            return await this.api.testAuth();
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error(`Could not communicate with ${this.upstreamType} API`);
            }
            throw e;
        }
    }

    cleanSourceSearchTitle = (playObj: PlayObject) => {
        const {
            data: {
                track,
            } = {},
        } = playObj;
        return track.toLocaleLowerCase().trim();
    }

    public playToClientPayload(playObject: PlayObject): object {
        return playToClientPayload(playObject);
    }

    doScrobble = async (playObj: PlayObject) => {

        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const sType = newFromSource ? 'New' : 'Backlog';

        try {
          const respPlay = await this.api.scrobble(playObj);
          if (newFromSource) {
            this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
        } else {
            this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
        }
        return respPlay;
        } catch (e) {
            const ignored = findCauseByReference(e, LastFMIgnoredScrobble);
            if(ignored !== undefined) {
                await this.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Ignored`, message: `Failed to scrobble => ${buildTrackString(playObj)} | ${e.message}`, priority: 'warn'});
            } else {
                await this.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            }
            this.logger.error({playInfo: buildTrackString(playObj), payload: playToClientPayload(playObj)}, `Scrobble Error (${sType})`);
            throw e;
        }
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        // last.fm shows Now Playing for the same time as the duration of the track being submitted
        try {
            return this.api.playingNow(data.play);
        } catch (e) {
            throw e;
        }
    }
}
