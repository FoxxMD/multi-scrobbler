import { Logger } from "@foxxmd/logging";
import dayjs from 'dayjs';
import EventEmitter from "events";
import { TrackScrobbleResponse, UserGetRecentTracksResponse } from "lastfm-node-client";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { LastfmClientConfig } from "../common/infrastructure/config/client/lastfm.js";
import LastfmApiClient from "../common/vendor/LastfmApiClient.js";
import { Notifiers } from "../notifier/Notifiers.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";

export default class LastfmScrobbler extends AbstractScrobbleClient {

    api: LastfmApiClient;
    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: LastfmClientConfig;

    constructor(name: any, config: LastfmClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('lastfm', name, config, notifier, emitter, logger);
        // @ts-expect-error sloppy data structure assign
        this.api = new LastfmApiClient(name, config.data, {...options, logger})
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => LastfmApiClient.formatPlayObj(obj, options);

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

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const resp = await this.api.callApi<UserGetRecentTracksResponse>((client: any) => client.userGetRecentTracks({
                user: this.api.user,
                sk: this.api.client.sessionKey,
                limit: this.MAX_STORED_SCROBBLES,
                extended: true
            }));
            const {
                recenttracks: {
                    track: list = [],
                }
            } = resp;
            this.recentScrobbles = list.reduce((acc: any, x: any) => {
                try {
                    const formatted = LastfmApiClient.formatPlayObj(x);
                    const {
                        data: {
                            track,
                            playDate,
                        },
                        meta: {
                            mbid,
                            nowPlaying,
                        }
                    } = formatted;
                    if(nowPlaying === true) {
                        // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
                        // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
                        // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
                        this.logger.debug("Ignoring 'now playing' track returned from Last.fm client", {track, mbid});
                        return acc;
                    } else if(playDate === undefined) {
                        this.logger.warn(`Last.fm recently scrobbled track did not contain a timestamp, omitting from time frame check`, {track, mbid});
                        return acc;
                    }
                    return acc.concat(formatted);
                } catch (e) {
                    this.logger.warn('Failed to format Last.fm recently scrobbled track, omitting from time frame check', {error: e.message});
                    this.logger.debug('Full api response object:');
                    this.logger.debug(x);
                    return acc;
                }
            }, []);
            this.logger.debug(`Found ${this.recentScrobbles.length} recent scrobbles`);
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;

                this.filterScrobbledTracks();
            }
        }
        this.lastScrobbleCheck = dayjs();
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
        return this.api.playToClientPayload(playObject);
    }

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const sType = newFromSource ? 'New' : 'Backlog';

        const scrobblePayload = this.api.playToClientPayload(playObj);

        try {
            const response = await this.api.callApi<TrackScrobbleResponse>((client: any) => client.trackScrobble(
                scrobblePayload));
            const {
                scrobbles: {
                    '@attr': {
                        accepted = 0,
                        ignored = 0,
                        code = undefined,
                    } = {},
                    scrobble: {
                        track: {
                           '#text': trackName,
                        } = {},
                        timestamp,
                        ignoredMessage: {
                            code: ignoreCode,
                            '#text': ignoreMsg,
                        } = {},
                        ...rest
                    } = {}
                } = {},
            } = response;
            if(code === 5) {
                throw new UpstreamError('LastFM API reported daily scrobble limit exceeded! 😬 Disabling client', {showStopper: true});
            }
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            if(ignored > 0) {
                await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: Service ignored this scrobble 😬 => (Code ${ignoreCode}) ${(ignoreMsg === '' ? '(No error message returned)' : ignoreMsg)}`, priority: 'warn'});
                this.logger.warn(`Service ignored this scrobble 😬 => (Code ${ignoreCode}) ${(ignoreMsg === '' ? '(No error message returned)' : ignoreMsg)} -- See https://www.last.fm/api/errorcodes for more information`, {payload: scrobblePayload});
                throw new UpstreamError('LastFM ignored scrobble', {showStopper: false});
            }

            return this.formatPlayObj({...rest, date: { uts: timestamp}, name: trackName});
            // last fm has rate limits but i can't find a specific example of what that limit is. going to default to 1 scrobble/sec to be safe
            //await sleep(1000);
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            this.logger.error(`Scrobble Error (${sType})`, {playInfo: buildTrackString(playObj), payload: scrobblePayload});
            if(!(e instanceof UpstreamError)) {
                throw new UpstreamError('Error received from LastFM API', {cause: e, showStopper: true});
            } else {
                throw e;
            }
        } finally {
            this.logger.debug('Raw Payload: ', scrobblePayload);
        }
    }
}
