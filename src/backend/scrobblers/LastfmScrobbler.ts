import { Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions, InternalConfigOptional } from "../common/infrastructure/Atomic.js";
import { LastfmClientConfig } from "../common/infrastructure/config/client/lastfm.js";
import LastfmApiClient, { LastFMIgnoredScrobble, playToClientPayload, formatPlayObj, LASTFM_HOST, LASTFM_PATH } from "../common/vendor/LastfmApiClient.js";
import { Notifiers } from "../notifier/Notifiers.js";
import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration, shouldUpdatePlayingNowPlatformWhenPlayingOnly } from "./AbstractScrobbleClient.js";
import { findCauseByReference } from "../utils/ErrorUtils.js";

export default class LastfmScrobbler extends AbstractScrobbleClient {

    api: LastfmApiClient;
    requiresAuth = true;
    requiresAuthInteraction = true;
    upstreamType: string = 'Last.fm';

    declare config: LastfmClientConfig;

    constructor(name: any, config: LastfmClientConfig, options: InternalConfigOptional & {[key: string]: any}, notifier: Notifiers, emitter: EventEmitter, logger: Logger, type = 'lastfm') {
        super(type, name, config, notifier, emitter, logger);
        this.api = new LastfmApiClient(name, config.data, {...options, logger});
        // https://www.last.fm/api/show/user.getRecentTracks
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
        this.supportsNowPlaying = true;
        // last.fm shows Now Playing for the same time as the duration of the track being submitted
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
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

    getScrobblesForRefresh = async (limit: number) => {
        return await this.api.getRecentTracks({limit});
    }

    getScrobblesForTimeRange = async (fromDate?: Dayjs, toDate?: Dayjs, limit: number = 1000): Promise<PlayObject[]> => {
        const allPlays: PlayObject[] = [];
        let currentPage = 1;
        const perPage = 200;

        while (allPlays.length < limit) {
            const resp = await this.api.getRecentTracksWithPagination({
                page: currentPage,
                limit: perPage,
                from: fromDate?.unix(),
                to: toDate?.unix(),
            });

            const {
                recenttracks: {
                    track: rawTracks = [],
                    '@attr': pageInfo
                } = {}
            } = resp;

            if (rawTracks.length === 0) {
                break;
            }

            const plays = rawTracks
                .filter(t => t.date !== undefined)
                .map(t => LastfmApiClient.formatPlayObj(t))
                .filter(p => p.data.playDate && p.data.playDate.isValid()); // Filter out plays with invalid dates

            allPlays.push(...plays);

            if (allPlays.length >= limit) {
                break;
            }

            if (pageInfo && currentPage >= parseInt(pageInfo.totalPages, 10)) {
                break;
            }

            currentPage++;
        }

        return allPlays.slice(0, limit);
    }

    cleanSourceSearchTitle = (playObj: PlayObject) => {
        const {
            data: {
                track,
            } = {},
        } = playObj;
        return track.toLocaleLowerCase().trim();
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => (await this.existingScrobble(playObj)) !== undefined

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
                await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Ignored`, message: `Failed to scrobble => ${buildTrackString(playObj)} | ${e.message}`, priority: 'warn'});
            } else {
                await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
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
