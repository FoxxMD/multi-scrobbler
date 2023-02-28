import dayjs from "dayjs";
import {
    readJson,
    writeFile,
    sortByPlayDate, sleep, parseRetryAfterSecsFromObj,
} from "../utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import AbstractSource, {RecentlyPlayedOptions} from "./AbstractSource.js";
import {SpotifySourceConfig} from "../common/infrastructure/config/source/spotify.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import PlayHistoryObject = SpotifyApi.PlayHistoryObject;
import {Notifiers} from "../notifier/Notifiers.js";

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';

export default class SpotifySource extends AbstractSource {

    spotifyApi: SpotifyWebApi;
    workingCredsPath: string;

    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: SpotifySourceConfig;

    constructor(name: any, config: SpotifySourceConfig, internal: InternalConfig, notifier: Notifiers) {
        super('spotify', name, config, internal, notifier);
        const {
            data: {
                interval = 60,
            } = {}
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        this.config.data.interval = interval;

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
    }

    static formatPlayObj(obj: PlayHistoryObject, newFromSource = false): PlayObject {
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
                artists: artists.map((x: any) => x.name),
                album: albumName,
                track: name,
                duration: duration_ms / 1000,
                playDate: dayjs(played_at),
            },
            meta: {
                source: 'Spotify',
                trackId: id,
                newFromSource,
                url: {
                    web: spotify
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
            this.logger.error('Could not successfully communicate with Spotify API');
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
        const {limit = 20} = options;
        const func = (api: SpotifyWebApi) => api.getMyRecentlyPlayedTracks({
            limit
        });
        const result = await this.callApi<ReturnType<typeof this.spotifyApi.getMyRecentlyPlayedTracks>>(func);
        return result.body.items.map((x: any) => SpotifySource.formatPlayObj(x)).sort(sortByPlayDate);
    }

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
                this.logger.error(e, {label: 'Spotify'});
                throw e;
            }
        }
    }

    poll = async (allClients: any) => {
        if (this.spotifyApi === undefined) {
            this.logger.warn('Cannot poll spotify without valid credentials configuration')
            return;
        }
        await this.startPolling(allClients);
    }
}
