import dayjs from "dayjs";
import {
    readJson,
    writeFile,
    sortByOldestPlayDate, sleep, parseRetryAfterSecsFromObj, buildTrackString, truncateStringToLength, combinePartsToString,
} from "../utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import AbstractSource, {RecentlyPlayedOptions} from "./AbstractSource.js";
import {SpotifySourceConfig} from "../common/infrastructure/config/source/spotify.js";
import {FormatPlayObjectOptions, InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import PlayHistoryObject = SpotifyApi.PlayHistoryObject;
import EventEmitter from "events";
import CurrentlyPlayingObject = SpotifyApi.CurrentlyPlayingObject;
import TrackObjectFull = SpotifyApi.TrackObjectFull;
import ArtistObjectSimplified = SpotifyApi.ArtistObjectSimplified;
import AlbumObjectSimplified = SpotifyApi.AlbumObjectSimplified;
import UserDevice = SpotifyApi.UserDevice;
import MemorySource from "./MemorySource.js";
import {ErrorWithCause} from "pony-cause";

const scopes = ['user-read-recently-played', 'user-read-currently-playing', 'user-read-playback-state', 'user-read-playback-position'];
const state = 'random';

const shortDeviceId = truncateStringToLength(10, '');

export default class SpotifySource extends MemorySource {

    spotifyApi: SpotifyWebApi;
    workingCredsPath: string;

    requiresAuth = true;
    requiresAuthInteraction = true;

    canGetState = false;

    declare config: SpotifySourceConfig;

    constructor(name: any, config: SpotifySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('spotify', name, config, internal, emitter);
        const {
            data: {
                interval = 30,
            } = {}
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be 15 seconds or above...😬');
        }

        this.config.data.interval = interval;

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
    }

    static formatPlayObj(obj: object, options: FormatPlayObjectOptions = {}): PlayObject {

        const {
            newFromSource = false
        } = options;

        let artists: ArtistObjectSimplified[];
        let album: AlbumObjectSimplified;
        let name: string;
        let duration_ms: number;
        let played_at: string;
        let id: string;
        let url: string;
        let playbackPosition: number | undefined;
        let deviceId: string | undefined;


        if (asPlayHistoryObject(obj)) {
            const {
                track,
                played_at: pa
            } = obj;
            const {
                artists: art = [],
                name: n,
                id: i,
                duration_ms: dm,
                album: a,
                external_urls: {
                    spotify,
                } = {}
            } = track;

            played_at = pa;
            artists = art;
            name = n;
            id = i;
            duration_ms = dm;
            album = a;
            url = spotify;

        } else if (asCurrentlyPlayingObject(obj)) {
            const {
                is_playing,
                progress_ms,
                timestamp,
                device: {
                    id: deviceIdentifier,
                    name: deviceName
                },
                item,
            } = obj;
            const {
                artists: art,
                name: n,
                id: i,
                duration_ms: dm,
                album: a,
                external_urls: {
                    spotify,
                } = {}
            } = item as TrackObjectFull;

            played_at = dayjs(timestamp).toISOString();
            artists = art;
            name = n;
            id = i;
            duration_ms = dm;
            album = a;
            url = spotify;
            playbackPosition = progress_ms / 1000;
            deviceId = combinePartsToString([shortDeviceId(deviceIdentifier), deviceName]);

        } else {
            throw new Error('Could not determine format of spotify response data');
        }

        const {name: albumName} = album || {};

        return {
            data: {
                artists: artists.map((x: any) => x.name),
                album: albumName,
                track: name,
                duration: duration_ms / 1000,
                playDate: dayjs(played_at),
            },
            meta: {
                deviceId,
                source: 'Spotify',
                trackId: id,
                trackProgressPosition: playbackPosition,
                newFromSource,
                url: {
                    web: url
                }
            }
        };
    }

    buildSpotifyApi = async () => {

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson(this.workingCredsPath, {throwOnNotFound: false}) as any;
        } catch (e) {
            this.logger.warn('Current spotify credentials file exists but could not be parsed', { path: this.workingCredsPath });
        }

        const {token: accessToken = undefined, refreshToken = undefined} = (spotifyCreds || {}) as any;

        const {
            clientId,
            clientSecret,
            redirectUri,
        } = this.config.data || {};

        const rdUri = redirectUri || `${this.localUrl}/callback`;

        const apiConfig = {
            clientId,
            clientSecret,
            accessToken,
            refreshToken,
        }

        if (Object.values(apiConfig).every(x => x === undefined)) {
            this.logger.info('No values found for Spotify configuration, skipping initialization');
            return;
        }
        // @ts-expect-error TS(2339): Property 'redirectUri' does not exist on type '{ c... Remove this comment to see the full error message
        apiConfig.redirectUri = rdUri;

        const validationErrors = [];

        if (clientId === undefined) {
            validationErrors.push('clientId must be defined');
        }
        if (clientSecret === undefined) {
            validationErrors.push('clientSecret must be defined');
        }
        if (rdUri === undefined) {
            validationErrors.push('redirectUri must be defined');
        }

        if (validationErrors.length !== 0) {
            this.logger.warn(`Configuration was not valid:\*${validationErrors.join('\n')}`);
            throw new Error('Failed to initialize a Spotify source');
        }

        this.spotifyApi = new SpotifyWebApi(apiConfig);
    }

    initialize = async () => {
        if(this.spotifyApi === undefined) {
            await this.buildSpotifyApi();
        }
        this.initialized = true;
        return this.initialized;
    }

    testAuth = async () => {
        try {
            await this.callApi<ReturnType<typeof this.spotifyApi.getMe>>(((api: any) => api.getMe()));
            this.authed = true;
        } catch (e) {
            this.logger.error(new ErrorWithCause('Could not successfully communicate with Spotify API', {cause: e}));
            this.authed = false;
        }
        return this.authed;
    }

    createAuthUrl = () => {
        return this.spotifyApi.createAuthorizeURL(scopes, this.name);
    }

    handleAuthCodeCallback = async ({
        error,
        code
    }: any) => {
        if (error === undefined) {
            const tokenResponse = await this.spotifyApi.authorizationCodeGrant(code);
            this.spotifyApi.setAccessToken(tokenResponse.body['access_token']);
            this.spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
            await writeFile(this.workingCredsPath, JSON.stringify({
                token: tokenResponse.body['access_token'],
                refreshToken: tokenResponse.body['refresh_token']
            }));
            this.logger.info('Got token from code grant authorization!');
            return true;
        } else {
            this.logger.warn('Callback contained an error! User may have denied access?')
            this.logger.error(error);
            return error;
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const plays: PlayObject[] = [];
        if(this.canGetState) {
            const state = await this.getCurrentPlaybackState();
            if(state.play !== undefined) {
                if(state.device.is_private_session) {
                    this.logger.debug(`Will not track play on Device ${state.device.name} because it is a private session: ${buildTrackString(state.play)}`);
                } else {
                    plays.push(state.play);
                }
            }
        } else {
            const currPlay = await this.getNowPlaying();
            if(currPlay !== undefined) {
                plays.push(currPlay);
            }
        }
        return this.processRecentPlays(plays, true);
    }

    getPlayHistory = async (options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        const func = (api: SpotifyWebApi) => api.getMyRecentlyPlayedTracks({
            limit
        });
        const result = await this.callApi<ReturnType<typeof this.spotifyApi.getMyRecentlyPlayedTracks>>(func);
        return result.body.items.map((x: any) => SpotifySource.formatPlayObj(x)).sort(sortByOldestPlayDate);
    }

    getNowPlaying = async () => {
        const func = (api: SpotifyWebApi) => api.getMyCurrentPlayingTrack();
        const playingRes = await this.callApi<ReturnType<typeof this.spotifyApi.getMyCurrentPlayingTrack>>(func);

        const {body: {item}} = playingRes;
        if(item !== undefined && item !== null) {
           return SpotifySource.formatPlayObj(playingRes.body, {newFromSource: true});
        }
        return undefined;
    }

    getCurrentPlaybackState = async (logError = true): Promise<{device?: UserDevice, play?: PlayObject}> => {
        try {
            const funcState = (api: SpotifyWebApi) => api.getMyCurrentPlaybackState();
            const res = await this.callApi<ReturnType<typeof this.spotifyApi.getMyCurrentPlaybackState>>(funcState);
            const {body: {
                device,
                item
            } = {}} = res;
            return {
                device: device === null ? undefined : device,
                play: item !== null && item !== undefined ? SpotifySource.formatPlayObj(res.body, {newFromSource: true}) : undefined
            }
        } catch (e) {
            if(logError) {
                this.logger.error(`Error occurred while trying to retrieve current playback state: ${e.message}`);
            }
            throw e;
        }
    }

/*    getDevices = async () => {
        const funcDevice = (api: SpotifyWebApi) => api.getMyDevices();
        return await this.callApi<ReturnType<typeof this.spotifyApi.getMyDevices>>(funcDevice);
    }*/

    callApi = async <T>(func: (api: SpotifyWebApi) => Promise<any>, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = 2,
        } = this.config.data;
        try {
            return await func(this.spotifyApi);
        } catch (e) {
            if (e.statusCode === 401) {
                if (this.spotifyApi.getRefreshToken() === undefined) {
                    throw new Error('Access token was not valid and no refresh token was present')
                }
                this.logger.debug('Access token was not valid, attempting to refresh');

                const tokenResponse = await this.spotifyApi.refreshAccessToken();
                const {
                    body: {
                        access_token,
                        // spotify may return a new refresh token
                        // if it doesn't then continue to use the last refresh token we received
                        refresh_token = this.spotifyApi.getRefreshToken(),
                    } = {}
                } = tokenResponse;
                this.spotifyApi.setAccessToken(access_token);
                await writeFile(this.workingCredsPath, JSON.stringify({
                    token: access_token,
                    refreshToken: refresh_token,
                }));
                try {
                    return await func(this.spotifyApi);
                } catch (ee) {
                    this.logger.error('Refreshing access token encountered an error');
                    this.logger.error(ee, {label: 'Spotify'});
                    throw ee;
                }
            } else if(maxRequestRetries > retries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return this.callApi(func, retries + 1);
            } else {
                this.logger.error(`Request failed on retry (${retries}) with no more retries permitted (max ${maxRequestRetries})`);
                const error = new ErrorWithCause(`Request failed on retry (${retries}) with no more retries permitted (max ${maxRequestRetries})`, {cause: e});
                this.logger.error(error);
                throw error;
            }
        }
    }

    poll = async () => {
        if (this.spotifyApi === undefined) {
            this.logger.warn('Cannot poll spotify without valid credentials configuration')
            return;
        }

        // test capabilities
        try {
            await this.getCurrentPlaybackState(false);
            this.canGetState = true;
        } catch (e) {
            this.logger.warn('multi-scrobbler does not have sufficient permissions to access Spotify API "Get Playback State". MS will continue to work but accuracy for determining if/when a track played from a Spotify Connect device (smart device controlled through Spotify app) may be degraded. To fix this re-authenticate MS with Spotify and restart polling.');
        }

        this.logger.info('Checking recently played API for tracks to backlog...');
        const backlogPlays = await this.getPlayHistory({formatted: true});
        this.scrobble(backlogPlays);
        this.logger.info('Backlog complete.');

        await this.startPolling();
    }
}

const asPlayHistoryObject = (obj: object): obj is PlayHistoryObject => {
    return 'played_at' in obj;
}

const asCurrentlyPlayingObject = (obj: object): obj is CurrentlyPlayingObject => {
    return 'is_playing' in obj;
}
