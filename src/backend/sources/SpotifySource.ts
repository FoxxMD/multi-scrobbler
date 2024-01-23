import dayjs, {Dayjs} from "dayjs";
import {
    readJson,
    writeFile,
    sortByOldestPlayDate,
    sleep,
    parseRetryAfterSecsFromObj,
    combinePartsToString,
    findCauseByFunc,
} from "../utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import {
    AccessToken,
    AuthorizationCodeWithPKCEStrategy, MaxInt, PlaybackState,
    SdkOptions,
    SpotifyApi,
    UserProfile,
    RecentlyPlayedTracksPage
} from '@fostertheweb/spotify-web-sdk';
import request from 'superagent';
import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";
import { SpotifySourceConfig } from "../common/infrastructure/config/source/spotify.js";
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
import PlayHistoryObject = SpotifyApi.PlayHistoryObject;
import EventEmitter from "events";
import CurrentlyPlayingObject = SpotifyApi.CurrentlyPlayingObject;
import TrackObjectFull = SpotifyApi.TrackObjectFull;
import ArtistObjectSimplified = SpotifyApi.ArtistObjectSimplified;
import AlbumObjectSimplified = SpotifyApi.AlbumObjectSimplified;
import UserDevice = SpotifyApi.UserDevice;
import MemorySource from "./MemorySource.js";
import {ErrorWithCause} from "pony-cause";
import { PlayObject, SCROBBLE_TS_SOC_END, SCROBBLE_TS_SOC_START, ScrobbleTsSOC } from "../../core/Atomic.js";
import { buildTrackString, truncateStringToLength } from "../../core/StringUtils.js";
import {getExceptionWithResponse, isNodeNetworkException} from "../common/errors/NodeErrors.js";
import { hasUpstreamError, UpstreamError } from "../common/errors/UpstreamError.js";
import {MSSpotifyResponseValidator} from "../common/vendor/spotify/SpotifyErrorHandler.js";
import {FileProvidedAccessTokenStrategy} from "../common/vendor/spotify/FileProvidedAccessTokenStrategy.js";

const shortDeviceId = truncateStringToLength(10, '');

export default class SpotifySource extends MemorySource {

    spotifyApi?: SpotifyApi
    workingCredsPath: string;
    workingCreds?: AccessToken;
    usedRedirectUri: string;

    requiresAuth = true;
    requiresAuthInteraction = true;

    canGetState = false;

    declare config: SpotifySourceConfig;

    constructor(name: any, config: SpotifySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('spotify', name, config, internal, emitter);
        const {
            data: {
                interval = DEFAULT_POLLING_INTERVAL,
                redirectUri
            } = {}
        } = config;

        if (interval < 5) {
            this.logger.warn('Interval should probably be 5 seconds or above! Spotify may return 429 response (too many requests)');
        }

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
        this.canBacklog = true;
        this.usedRedirectUri = redirectUri || `${this.localUrl}/callback`;
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

        const {token: accessToken = undefined, refreshToken = undefined} = (spotifyCreds || {}) as MSCredentials;

        const {
            clientId,
            clientSecret,
        } = this.config.data || {};

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

        const validationErrors = [];

        if (clientId === undefined) {
            validationErrors.push('clientId must be defined');
        }
        if (clientSecret === undefined) {
            validationErrors.push('clientSecret must be defined');
        }
        if (this.usedRedirectUri === undefined) {
            validationErrors.push('redirectUri must be defined');
        }

        if (validationErrors.length !== 0) {
            this.logger.warn(`Configuration was not valid:\*${validationErrors.join('\n')}`);
            throw new Error('Failed to initialize a Spotify source');
        }

        const onRefreshToken = async (data: AccessToken) => {
            try {
                await writeFile(this.workingCredsPath, JSON.stringify(accessTokenToMSCreds(data)));
                this.logger.debug('Refreshed access token');
            } catch (e) {
                this.logger.warn(new ErrorWithCause('Failed to write refreshed access token to file', {cause: e}));
            }
        }

        const sdkOpts: SdkOptions = {
            responseValidator: new MSSpotifyResponseValidator()
        }

        if(accessToken === undefined || refreshToken === undefined) {
            this.logger.info(`No access or refresh token is present. User interaction for authentication is required.`);
            this.logger.info(`Redirect URL that will be used on auth callback: '${this.usedRedirectUri}'`);
        } else {
            this.workingCreds = msCredsToAccessToken(spotifyCreds as MSCredentials);
            this.spotifyApi = new SpotifyApi(new FileProvidedAccessTokenStrategy(clientId, this.workingCreds, onRefreshToken), sdkOpts);
            //this.spotifyApi = SpotifyApi.withAccessToken(clientId, msCredsToAccessToken(spotifyCreds as MSCredentials), sdkOpts);
        }
    }

    protected setCredentials = async (data: AccessToken) => {
        try {
            this.workingCreds = data;
            await writeFile(this.workingCredsPath, JSON.stringify(accessTokenToMSCreds(data)));
            this.logger.debug('Wrote new credentials');
        } catch (e) {
            this.logger.warn(new ErrorWithCause('Failed to write refreshed crendentials to file', {cause: e}));
        }
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
                throw new ErrorWithCause('Could not communicate with Spotify API server', {cause: e});
            }
            if(e.status >= 500) {
                throw new ErrorWithCause('Spotify API server returned an unexpected response', { cause: e});
            }
            return true;
        }
    }

    doAuthentication = async () => {
        try {
            if(null === (await this.spotifyApi.getAccessToken())) {
                this.logger.warn('Cannot use API until an access token has been received from the authorization flow. See the dashboard.');
                return false;
            }

            await this.callApi<UserProfile>((api) => api.currentUser.profile());
            return true;
        } catch (e) {
            throw e;
        }
    }

    handleAuthCodeCallback = async ({
        data,
    }: any) => {
        try {
            await this.setCredentials(data as AccessToken);
            await this.buildSpotifyApi();
            return true;
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
        const result = await this.callApi((api) => api.player.getRecentlyPlayedTracks(limit as MaxInt<50>))
        return result.items.map((x: any) => SpotifySource.formatPlayObj(x)).sort(sortByOldestPlayDate);
    }

    getNowPlaying = async () => {

        const playingRes = await this.callApi((api) => api.player.getCurrentlyPlayingTrack())

        if(playingRes.item !== undefined && playingRes.item !== null) {
            // @ts-expect-error
           return SpotifySource.formatPlayObj(playingRes, {newFromSource: true});
        }
        return undefined;
    }

    getCurrentPlaybackState = async (logError = true): Promise<{device?: UserDevice, playerState?: PlayerStateData}> => {
        try {
            const resp = await this.callApi((api) => api.player.getPlaybackState())
            const {
                device,
                item,
                is_playing,
                timestamp,
                progress_ms,
            } = resp;
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
                        // @ts-expect-error
                        play: item !== null && item !== undefined ? SpotifySource.formatPlayObj(resp, {newFromSource: true}) : undefined,
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
            throw new ErrorWithCause('Error occurred while trying to retrieve current playback state', {cause: e});
        }
    }

    callApi = async <T>(func: (api: SpotifyApi) => Promise<T>, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = 2,
        } = this.config.data;
        try {
            return await func(this.spotifyApi);
        } catch (e) {
            let spotifyError: UpstreamError | Error | ErrorWithCause;
            if(e instanceof UpstreamError) {
                spotifyError = e;
            } else if(isNodeNetworkException(e)) {
                spotifyError = new UpstreamError('Could not reach Spotify API server', {cause: e});
            } else {
                spotifyError = new ErrorWithCause('Unexpected error occurred in Spotify API library', {cause: e});
            }
            const resp = getExceptionWithResponse(spotifyError);
            if((isNodeNetworkException(e) || (resp !== undefined && !resp.showStopper))) {
                if(maxRequestRetries > retries) {
                    const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                    this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                    await sleep(retryAfter * 1000);
                    return this.callApi(func, retries + 1);
                } else {
                    const error = new UpstreamError(`Request failed on retry (${retries}) with no more retries permitted (max ${maxRequestRetries})`, {cause: spotifyError});
                    this.logger.error(error);
                    throw error;
                }
            } else {
                if(hasApiPermissionError(e)) {
                    throw new UpstreamError('Spotify API failed likely due to missing permissions. Reauthenticate your client.', {cause: spotifyError});
                }
                throw spotifyError;
            }
        }
    }

    onPollPreAuthCheck = async () => {
        if ((await this.spotifyApi.getAccessToken()) === null) {
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

    protected getBackloggedPlays = async () => {
        return await this.getPlayHistory({formatted: true});
    }
}

const asPlayHistoryObject = (obj: object): obj is PlayHistoryObject => {
    return 'played_at' in obj;
}

const asCurrentlyPlayingObject = (obj: object): obj is CurrentlyPlayingObject => {
    return 'is_playing' in obj;
}

const hasApiPermissionError = (e: Error): boolean => {
    return findCauseByFunc(e, (err) => {
        return err.message.includes('Permissions missing');
    }) !== undefined;
}

const hasApiAuthError = (e: Error): boolean => {
    return findCauseByFunc(e, (err) => {
        return err.message.includes('An authentication error occurred');
    }) !== undefined;
}

const hasApiTimeoutError = (e: Error): boolean => {
    return findCauseByFunc(e, (err) => {
        return err.message.includes('A timeout occurred');
    }) !== undefined;
}

const hasApiError = (e: Error): boolean => {
    return findCauseByFunc(e, (err) => {
        return err.message.includes('while communicating with Spotify\'s Web API.');
    }) !== undefined;
}

interface MSCredentials {
    token: string
    refreshToken: string
    expires?: number
    expiresIn?: number
    grant?: string
}

const msCredsToAccessToken = (data: MSCredentials): AccessToken => {
    return {
        access_token: data.token,
        refresh_token: data.refreshToken,
        expires: data.expires ?? Date.now(),
        token_type: data.grant ?? 'Bearer',
        expires_in: data.expiresIn ?? 3600
    }
}

export const accessTokenToMSCreds = (data: AccessToken): MSCredentials => {
    return {
        token: data.access_token,
        refreshToken: data.refresh_token,
        expires: Date.now() + (data.expires_in * 1000),
        grant: data.token_type,
        expiresIn: data.expires_in
    }
}
