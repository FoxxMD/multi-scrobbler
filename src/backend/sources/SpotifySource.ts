import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import SpotifyWebApi from "spotify-web-api-node";
import request from 'superagent';
import { PlayObject, SCROBBLE_TS_SOC_END, SCROBBLE_TS_SOC_START, ScrobbleTsSOC } from "../../core/Atomic.js";
import { truncateStringToLength } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { hasUpstreamError, UpstreamError } from "../common/errors/UpstreamError.js";
import {
    DEFAULT_POLLING_INTERVAL,
    FormatPlayObjectOptions,
    InternalConfig,
    NO_DEVICE,
    NO_USER,
    PlayerStateData,
    ReportedPlayerStatus,
    SourceData,
} from "../common/infrastructure/Atomic.js";
import { SpotifySourceConfig } from "../common/infrastructure/config/source/spotify.js";
import {
    combinePartsToString,
    joinedUrl,
    parseRetryAfterSecsFromObj,
    readJson,
    sleep,
    sortByOldestPlayDate,
    writeFile,
} from "../utils.js";
import { findCauseByFunc } from "../utils/ErrorUtils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import AlbumObjectSimplified = SpotifyApi.AlbumObjectSimplified;
import ArtistObjectSimplified = SpotifyApi.ArtistObjectSimplified;
import CurrentlyPlayingObject = SpotifyApi.CurrentlyPlayingObject;
import PlayHistoryObject = SpotifyApi.PlayHistoryObject;
import TrackObjectFull = SpotifyApi.TrackObjectFull;
import UserDevice = SpotifyApi.UserDevice;

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
                interval = DEFAULT_POLLING_INTERVAL,
            } = {}
        } = config;

        if (interval < 5) {
            this.logger.warn('Interval should probably be 5 seconds or above! Spotify may return 429 response (too many requests)');
        }

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
        this.canBacklog = true;
        this.supportsUpstreamRecentlyPlayed = true;
        // https://developer.spotify.com/documentation/web-api/reference/get-recently-played
        this.SCROBBLE_BACKLOG_COUNT = 50
    }

    static formatPlayObj(obj: PlayHistoryObject | CurrentlyPlayingObject, options: FormatPlayObjectOptions = {}): PlayObject {

        const {
            newFromSource = false
        } = options;

        let artists: ArtistObjectSimplified[];
        let album: AlbumObjectSimplified;
        let name: string;
        let duration_ms: number;
        let played_at: Dayjs;
        let playDateCompleted: Dayjs | undefined;
        let id: string;
        let url: string;
        let playbackPosition: number | undefined;
        let deviceId: string | undefined;
        let scrobbleTsSOC: ScrobbleTsSOC;


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

            scrobbleTsSOC = SCROBBLE_TS_SOC_END;
            played_at = dayjs(pa);
            playDateCompleted = played_at;
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
                } = {},
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

            scrobbleTsSOC = SCROBBLE_TS_SOC_START;
            played_at = dayjs(timestamp);
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

        const {name: albumName, artists: albumArtists = []} = album || {};

        const trackArtistIds = artists.map(x => x.id);
        let actualAlbumArtists: ArtistObjectSimplified[] = [];
        if(albumArtists.filter(x => !trackArtistIds.includes(x.id)).length > 0) {
            // only include album artists if they are not the EXACT same as the track artists
            // ...if they aren't the exact same then include all artists, even if they are duplicates of track artists
            actualAlbumArtists = albumArtists;
        }

        return {
            data: {
                artists: artists.map(x => x.name),
                albumArtists: actualAlbumArtists.map(x => x.name),
                album: albumName,
                track: name,
                duration: duration_ms / 1000,
                playDate: played_at,
                playDateCompleted
            },
            meta: {
                deviceId: deviceId ?? `${NO_DEVICE}-${NO_USER}`,
                source: 'Spotify',
                trackId: id,
                trackProgressPosition: playbackPosition,
                scrobbleTsSOC,
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

        const rdUri: string = redirectUri || joinedUrl(this.localUrl, 'callback').toString();

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
            this.logger.warn(`Configuration was not valid: *${validationErrors.join('\n')}`);
            throw new Error('Failed to initialize a Spotify source');
        }

        if(accessToken === undefined || refreshToken === undefined) {
            this.logger.info(`No access or refresh token is present. User interaction for authentication is required.`);
            this.logger.info(`Redirect URL that will be used on auth callback: '${rdUri}'`);
        }

        this.spotifyApi = new SpotifyWebApi(apiConfig);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        await this.buildSpotifyApi();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await request.get('https://api.spotify.com/v1');
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                throw new Error('Could not communicate with Spotify API server', {cause: e});
            }
            if(e.status >= 500) {
                throw new Error('Spotify API server returned an unexpected response', { cause: e});
            }
            return true;
        }
    }

    doAuthentication = async () => {
        try {
            if(undefined === this.spotifyApi.getAccessToken()) {
                this.logger.warn('Cannot use API until an access token has been received from the authorization flow. See the dashboard.');
                return false;
            }
            await this.callApi<ReturnType<typeof this.spotifyApi.getMe>>(((api: any) => api.getMe()));
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Spotify API');
            }
            throw e;
        }
    }

    createAuthUrl = () => this.spotifyApi.createAuthorizeURL(scopes, this.name)

    handleAuthCodeCallback = async ({
        error,
        code
    }: any) => {
        try {
            if (error === undefined) {
                const tokenResponse = await this.spotifyApi.authorizationCodeGrant(code);
                this.spotifyApi.setAccessToken(tokenResponse.body['access_token']);
                this.spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
                await writeFile(this.workingCredsPath, JSON.stringify({
                    token: tokenResponse.body['access_token'],
                    refreshToken: tokenResponse.body['refresh_token'],
                    expires: Date.now() + (tokenResponse.body['expires_in'] * 1000),
                    expiresIn: tokenResponse.body['expires_in'],
                    grant: tokenResponse.body['token_type']
                }));
                this.logger.info('Got token from code grant authorization!');
                return true;
            } else {
                this.logger.warn('Callback contained an error! User may have denied access?')
                this.logger.error(error);
                return error;
            }
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const plays: SourceData[] = [];
        if(this.canGetState) {
            const state = await this.getCurrentPlaybackState();
            if(state.playerState !== undefined) {
                if(state.device.is_private_session) {
                    this.logger.debug(`Will not track play on Device ${state.device.name} because it is in a private session.`);
                } else {
                    plays.push(state.playerState);
                }
            }
        } else {
            const currPlay = await this.getNowPlaying();
            if(currPlay !== undefined) {
                plays.push(currPlay);
            }
        }
        const newPlays = this.processRecentPlays(plays);
        // hint that scrobble timestamp source of truth should be when the track ended (player changed tracks)
        // rather than when we first saw the track
        //
        // this is because Spotify play history (getMyRecentlyPlayedTracks) timestamps based on end of play
        // and when we backlog we want timestamps to be as accurate as possible
        return newPlays.map(x => ({...x, meta: {...x.meta, scrobbleTsSOC: SCROBBLE_TS_SOC_END}}))
    }

    getPlayHistory = async (options: RecentlyPlayedOptions = {}) => {
        const {limit = 20} = options;
        const func = (api: SpotifyWebApi) => api.getMyRecentlyPlayedTracks({
            limit
        });
        const result = await this.callApi<ReturnType<typeof this.spotifyApi.getMyRecentlyPlayedTracks>>(func);
        return result.body.items.map((x: any) => SpotifySource.formatPlayObj(x)).sort(sortByOldestPlayDate);
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        try {
            return await this.getPlayHistory(options);
        } catch (e) {
            throw e;
        }
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

    getCurrentPlaybackState = async (logError = true): Promise<{device?: UserDevice, playerState?: PlayerStateData}> => {
        try {
            const funcState = (api: SpotifyWebApi) => api.getMyCurrentPlaybackState();
            const res = await this.callApi<ReturnType<typeof this.spotifyApi.getMyCurrentPlaybackState>>(funcState);
            const {
                body: {
                    device,
                    item,
                    is_playing,
                    timestamp,
                    progress_ms,
                } = {}
            } = res;
            if(device !== undefined) {
                let status: ReportedPlayerStatus = 'stopped';
                if(is_playing) {
                    status = 'playing';
                } else if(item !== null && item !== undefined) {
                    status = 'paused';
                }
                return {
                    device,
                    playerState: {
                        platformId: [combinePartsToString([shortDeviceId(device.id), device.name]), NO_USER],
                        status,
                        play: item !== null && item !== undefined ? SpotifySource.formatPlayObj(res.body, {newFromSource: true}) : undefined,
                        timestamp: dayjs(timestamp),
                        position: progress_ms !== null && progress_ms !== undefined ? progress_ms / 1000 : undefined,
                    }
                }
            }

            return {};
        } catch (e) {
            if(hasApiError(e)) {
                throw new UpstreamError('Error occurred while trying to retrieve current playback state', {cause: e});
            }
            throw new Error('Error occurred while trying to retrieve current playback state', {cause: e});
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
        } = this.config.options;
        try {
            return await func(this.spotifyApi);
        } catch (e) {
            const spotifyError = new UpstreamError('Spotify API call failed', {cause: e});
            if (e.statusCode === 401 && !hasApiPermissionError(e)) {
                if (this.spotifyApi.getRefreshToken() === undefined) {
                    throw new Error('Access token was not valid and no refresh token was present')
                }
                this.logger.debug('Access token was not valid, attempting to refresh');

                try {
                    const tokenResponse = await this.spotifyApi.refreshAccessToken();
                    const {
                        body: {
                            access_token,
                            // spotify may return a new refresh token
                            // if it doesn't then continue to use the last refresh token we received
                            refresh_token = this.spotifyApi.getRefreshToken(),
                            expires_in,
                            token_type
                        } = {}
                    } = tokenResponse;
                    this.spotifyApi.setAccessToken(access_token);
                    await writeFile(this.workingCredsPath, JSON.stringify({
                        token: access_token,
                        refreshToken: refresh_token,
                        expires: Date.now() + (expires_in * 1000),
                        expiresIn: expires_in,
                        grant: token_type
                    }));
                } catch (refreshError) {
                    const error = new UpstreamError('Refreshing access token encountered an error', {cause: refreshError});
                    this.logger.error(error);
                    this.logger.error(spotifyError);
                    throw error;
                }

                try {
                    return await func(this.spotifyApi);
                } catch (ee) {
                    const secondSpotifyError = new UpstreamError('Spotify API call failed even after refreshing token', {cause: ee});
                    this.logger.error(secondSpotifyError);
                    this.logger.error(spotifyError);
                    throw secondSpotifyError;
                }
            } else if(maxRequestRetries > retries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return this.callApi(func, retries + 1);
            } else {
                const error = new UpstreamError(`Request failed on retry (${retries}) with no more retries permitted (max ${maxRequestRetries})`, {cause: e});
                this.logger.error(error);
                throw error;
            }
        }
    }

    onPollPreAuthCheck = async () => {
        if (this.spotifyApi === undefined) {
            this.logger.warn('Cannot poll spotify without valid credentials configuration')
            return false;
        }
        return true;
    }

    onPollPostAuthCheck = async () => {
        // test capabilities
        try {
            await this.getCurrentPlaybackState(false);
            this.canGetState = true;
        } catch (e) {
            if(hasApiPermissionError(e)) {
                this.logger.warn('multi-scrobbler does not have sufficient permissions to access Spotify API "Get Playback State". MS will continue to work but accuracy for determining if/when a track played from a Spotify Connect device (smart device controlled through Spotify app) may be degraded. To fix this re-authenticate MS with Spotify and restart polling.');
                this.canGetState = false;
                return false;
            } else {
                if(!hasUpstreamError(e)) {
                    this.logger.error(e);
                }
                return false;
            }
        }

        return true;
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getPlayHistory({formatted: true, ...options})
}

const asPlayHistoryObject = (obj: object): obj is PlayHistoryObject => 'played_at' in obj

const asCurrentlyPlayingObject = (obj: object): obj is CurrentlyPlayingObject => 'is_playing' in obj

const hasApiPermissionError = (e: Error): boolean => findCauseByFunc(e, (err) => err.message.includes('Permissions missing')) !== undefined

const hasApiAuthError = (e: Error): boolean => findCauseByFunc(e, (err) => err.message.includes('An authentication error occurred')) !== undefined

const hasApiTimeoutError = (e: Error): boolean => findCauseByFunc(e, (err) => err.message.includes('A timeout occurred')) !== undefined

const hasApiError = (e: Error): boolean => findCauseByFunc(e, (err) => err.message.includes('while communicating with Spotify\'s Web API.')) !== undefined
