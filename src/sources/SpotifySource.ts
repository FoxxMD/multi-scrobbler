import dayjs from "dayjs";
import {
    readJson,
    writeFile,
    sortByPlayDate, sleep, parseRetryAfterSecsFromObj,
} from "../utils";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'spot... Remove this comment to see the full error message
import SpotifyWebApi from "spotify-web-api-node";
import AbstractSource from "./AbstractSource";
import {SpotifySourceConfig} from "../common/infrastructure/config/source/spotify";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic";

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';

export default class SpotifySource extends AbstractSource {

    spotifyApi: any;
    workingCredsPath: string;

    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: SpotifySourceConfig;

    constructor(name: any, config: SpotifySourceConfig, internal: InternalConfig) {
        super('spotify', name, config, internal);
        const {
            data: {
                interval = 60,
            } = {}
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        // @ts-expect-error TS(2339): Property 'interval' does not exist on type '{}'.
        this.config.interval = interval;

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
    }

    static formatPlayObj(obj: any, newFromSource = false): PlayObject {
        const {
            track: {
                artists = [],
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                name,
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                id,
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                duration_ms,
                album: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    name: albumName,
                } = {},
                external_urls: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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
                trackLength: duration_ms / 1000,
                source: 'Spotify',
                sourceId: id,
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
            spotifyCreds = await readJson(this.workingCredsPath, {throwOnNotFound: false});
        } catch (e) {
            this.logger.warn('Current spotify credentials file exists but could not be parsed', { path: this.workingCredsPath });
        }

        const {
            // @ts-expect-error TS(2339): Property 'accessToken' does not exist on type '{}'... Remove this comment to see the full error message
            accessToken,
            // @ts-expect-error TS(2339): Property 'clientId' does not exist on type '{}'.
            clientId,
            // @ts-expect-error TS(2339): Property 'clientSecret' does not exist on type '{}... Remove this comment to see the full error message
            clientSecret,
            // @ts-expect-error TS(2339): Property 'redirectUri' does not exist on type '{}'... Remove this comment to see the full error message
            redirectUri,
            // @ts-expect-error TS(2339): Property 'refreshToken' does not exist on type '{}... Remove this comment to see the full error message
            refreshToken,
        } = this.config || {};

        const rdUri = redirectUri || `${this.localUrl}/callback`;


        // @ts-expect-error TS(2339): Property 'token' does not exist on type '{}'.
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
        // @ts-expect-error TS(2339): Property 'redirectUri' does not exist on type '{ c... Remove this comment to see the full error message
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

    initialize = async () => {
        if(this.spotifyApi === undefined) {
            await this.buildSpotifyApi();
        }
        this.initialized = true;
        return this.initialized;
    }

    testAuth = async () => {
        try {
            await this.callApi(((api: any) => api.getMe()));
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

    getRecentlyPlayed = async (options = {}) => {
        // @ts-expect-error TS(2339): Property 'limit' does not exist on type '{}'.
        const {limit = 20, formatted = false} = options;
        const func = (api: any) => api.getMyRecentlyPlayedTracks({
            limit
        });
        const result = await this.callApi(func);
        if (formatted === true) {
            return result.body.items.map((x: any) => SpotifySource.formatPlayObj(x)).sort(sortByPlayDate);
        }
        return result;
    }

    // @ts-expect-error TS(7024): Function implicitly has return type 'any' because ... Remove this comment to see the full error message
    callApi = async (func: any, retries = 0) => {
        const {
            // @ts-expect-error TS(2339): Property 'maxRequestRetries' does not exist on typ... Remove this comment to see the full error message
            maxRequestRetries = 1,
            // @ts-expect-error TS(2339): Property 'retryMultiplier' does not exist on type ... Remove this comment to see the full error message
            retryMultiplier = 2,
        } = this.config;
        try {
            return await func(this.spotifyApi);
        } catch (e) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            if (e.statusCode === 401) {
                if (this.spotifyApi.getRefreshToken() === undefined) {
                    throw new Error('Access token was not valid and no refresh token was present')
                }
                this.logger.debug('Access token was not valid, attempting to refresh');

                const tokenResponse = await this.spotifyApi.refreshAccessToken();
                const {
                    body: {
                        // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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
                    // @ts-expect-error TS(2769): No overload matches this call.
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
                // @ts-expect-error TS(2769): No overload matches this call.
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
