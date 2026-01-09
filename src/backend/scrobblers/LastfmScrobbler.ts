import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { LastfmClientConfig } from "../common/infrastructure/config/client/lastfm.js";
import LastfmApiClient, { LastFMIgnoredScrobble, playToClientPayload, formatPlayObj } from "../common/vendor/LastfmApiClient.js";
import { Notifiers } from "../notifier/Notifiers.js";
import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration } from "./AbstractScrobbleClient.js";

export default class LastfmScrobbler extends AbstractScrobbleClient {

    api: LastfmApiClient;
    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: LastfmClientConfig;

    constructor(name: any, config: LastfmClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('lastfm', name, config, notifier, emitter, logger);
        // @ts-expect-error sloppy data structure assign
        this.api = new LastfmApiClient(name, config.data, {...options, logger})
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

    doAuthentication = async () => {
        try {
            return await this.api.testAuth();
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Last.fm API');
            }
            throw e;
        }
    }

    getScrobblesForRefresh = async (limit: number) => {
        return await this.api.getRecentTracks({limit});
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
            if(e instanceof LastFMIgnoredScrobble) {
                await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Ignored`, message: `Failed to scrobble => ${buildTrackString(playObj)} | ${e.message}`, priority: 'warn'});
            } else {
                await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            }
            this.logger.error({playInfo: buildTrackString(playObj), payload: playToClientPayload(playObj)}, `Scrobble Error (${sType})`);
            if(!(e instanceof UpstreamError)) {
                throw new UpstreamError('Error received from LastFM API', {cause: e, showStopper: true});
            } else {
                throw e;
            }
        }
    }

    doPlayingNow = async (data: PlayObject) => {
        // last.fm shows Now Playing for the same time as the duration of the track being submitted
        try {
            return this.api.playingNow(data);
        } catch (e) {
            throw e;
        }
    }
}
