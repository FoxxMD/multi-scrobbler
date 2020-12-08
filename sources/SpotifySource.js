import dayjs from "dayjs";
import {
    readJson,
    writeFile,
    sortByPlayDate,
} from "../utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import AbstractSource from "./AbstractSource.js";

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';

export default class SpotifySource extends AbstractSource {

    spotifyApi;
    localUrl;
    workingCredsPath;
    configDir;

    constructor(name, config = {}, clients = []) {
        super('spotify', name, config, clients);
        const {
            localUrl,
            configDir,
            interval = 60,
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        this.config.interval = interval;

        this.configDir = configDir;
        this.workingCredsPath = `${configDir}/currentCreds-${name}.json`;
        this.localUrl = localUrl;
        this.canPoll = true;
    }

    static formatPlayObj(obj, newFromSource = false) {
        const {
            track: {
                artists = [],
                name,
                id,
                duration_ms,
                album: {
                    name: albumName,
                } = {},
                external_urls: {
                    spotify,
                } = {}
            } = {},
            played_at
        } = obj;
        //let artistString = artists.reduce((acc, curr) => acc.concat(curr.name), []).join(',');
        return {
            data: {
                artists: artists.map(x => x.name),
                album: albumName,
                track: name,
                duration: duration_ms / 1000,
                playDate: dayjs(played_at),
            },
            meta: {
                trackLength: duration_ms / 1000,
                source: 'Spotify',
                sourceId: id,
                newFromSource,
                url: {
                    web: spotify
                }
            }
        }
    }

    buildSpotifyApi = async () => {

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson(this.workingCredsPath, {throwOnNotFound: false});
        } catch (e) {
            this.logger.warn('Current spotify credentials file exists but could not be parsed', { path: this.workingCredsPath });
        }

        const {
            accessToken,
            clientId,
            clientSecret,
            redirectUri,
            refreshToken,
        } = this.config || {};

        const rdUri = redirectUri || `${this.localUrl}/callback`;


        const {token = accessToken, refreshToken: rt = refreshToken} = spotifyCreds || {};

        const apiConfig = {
            clientId,
            clientSecret,
            accessToken: token,
            refreshToken: rt,
        }

        if (Object.values(apiConfig).every(x => x === undefined)) {
            this.logger.info('No values found for Spotify configuration, skipping initialization');
            return;
        }
        apiConfig.redirectUri = rdUri;

        const validationErrors = [];

        if (token === undefined) {
            if (clientId === undefined) {
                validationErrors.push('clientId must be defined when access token is not present');
            }
            if (clientSecret === undefined) {
                validationErrors.push('clientSecret must be defined when access token is not present');
            }
            if (rdUri === undefined) {
                validationErrors.push('redirectUri must be defined when access token is not present');
            }
            if (validationErrors.length !== 0) {
                validationErrors.unshift('no access token is defined');
            }
        } else if (rt === undefined && (
            clientId === undefined ||
            clientSecret === undefined ||
            rdUri === undefined
        )) {
            this.logger.warn('Access token is present but no refresh token is defined and remaining configuration is not sufficient to re-authorize. Without a refresh token API calls will fail after current token is expired.');
        }

        if (validationErrors.length !== 0) {
            this.logger.warn(`Configuration was not valid:\*${validationErrors.join('\n')}`);
            throw new Error('Failed to initialize a Spotify source');
        }

        this.spotifyApi = new SpotifyWebApi(apiConfig);
    }

    createAuthUrl = () => {
        return this.spotifyApi.createAuthorizeURL(scopes, this.name);
    }

    handleAuthCodeCallback = async ({error, code}) => {
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

    getRecentlyPlayed = async (options = {}) => {
        const {limit = 20, formatted = false} = options;
        const func = api => api.getMyRecentlyPlayedTracks({
            limit
        });
        const result = await this.callApi(func);
        if (formatted === true) {
            return result.body.items.map(x => SpotifySource.formatPlayObj(x)).sort(sortByPlayDate);
        }
        return result;
    }

    callApi = async (func) => {
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
            } else {
                this.logger.error('Refreshing access token encountered an error');
                this.logger.error(e, {label: 'Spotify'});
                throw e;
            }
        }
    }

    poll = async (allClients) => {
        if (this.spotifyApi === undefined) {
            this.logger.warn('Cannot poll spotify without valid credentials configuration')
            return;
        }
        await this.startPolling(allClients);
    }
}
