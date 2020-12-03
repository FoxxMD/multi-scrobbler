import dayjs from "dayjs";
import {EventEmitter} from "events";
import {
    buildTrackString,
    readJson,
    sleep,
    writeFile,
    makeSingle,
    sortByPlayDate,
    createLabelledLogger
} from "../utils.js";
import SpotifyWebApi from "spotify-web-api-node";

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';

export default class SpotifySource {

    logger;
    spotifyApi;
    interval;
    localUrl;
    workingCredsPath;
    configDir;

    spotifyPoller;
    pollerRunning = false;

    emitter;
    discoveredTracks = 0;

    constructor(config = {}) {
        this.logger = createLabelledLogger('spotify', 'Spotify');
        const {
            localUrl,
            configDir,
        } = config;

        this.configDir = configDir;
        this.workingCredsPath = `${configDir}/currentCreds.json`;
        this.localUrl = localUrl;
        this.spotifyPoller = makeSingle(pollSpotify);
        this.emitter = new EventEmitter();
        this.emitter.addListener('spotifyTrackDiscovered', this.handleDiscoveredTrack);
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
                newFromSource,
                url: {
                    web: spotify
                }
            }
        }
    }

    handleDiscoveredTrack = (e) => {
        this.discoveredTracks++;
    }

    buildSpotifyApi = async (spotifyObj) => {

        this.logger.debug('Initializing Spotify source');

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson(this.workingCredsPath, {throwOnNotFound: false});
        } catch (e) {
            this.logger.warn('Current spotify credentials file exists but could not be parsed');
        }

        let spotifyConfig = spotifyObj;
        if (spotifyObj === undefined) {
            try {
                spotifyConfig = await readJson(`${this.configDir}/spotify.json`, {throwOnNotFound: false});
            } catch (e) {
                this.logger.warn('Spotify config file exists but could not be parsed');
            }
        }

        const {
            accessToken = process.env.SPOTIFY_ACCESS_TOKEN,
            clientId = process.env.SPOTIFY_CLIENT_ID,
            clientSecret = process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri = process.env.SPOTIFY_REDIRECT_URI,
            refreshToken = process.env.SPOTIFY_REFRESH_TOKEN,
            interval = 60,
        } = spotifyConfig || {};

        if (interval < 15) {
            console.warn('Interval should be above 30 seconds...😬');
        }
        this.interval = interval;

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
            this.logger.warn(`Spotify configuration was not valid:\n*${validationErrors.join('\n')}`);
            return;
        }

        this.logger.info('Spotify source initialized');
        this.spotifyApi = new SpotifyWebApi(apiConfig);
    }

    createAuthUrl = () => {
        return this.spotifyApi.createAuthorizeURL(scopes, state);
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
        const result = await this.trySpotifyCall(func);
        if (formatted === true) {
            return result.body.items.map(x => SpotifySource.formatPlayObj(x)).sort(sortByPlayDate);
        }
        return result;
    }

    trySpotifyCall = async (func) => {
        try {
            return await func(this.spotifyApi);
        } catch (e) {
            if (e.statusCode === 401) {
                if (this.spotifyApi.getRefreshToken() === undefined) {
                    this.logger.error('Access token was not valid and no refresh token was present, bailing out of polling');
                    return Promise.resolve();
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

    pollSpotify = (clients) => {
        if (this.spotifyApi === undefined) {
            this.logger.warn('Cannot poll spotify without valid credentials configuration')
            return;
        }
        this.pollerRunning = true;
        return this.spotifyPoller(this.logger, this, this.interval, this.workingCredsPath, clients, this.emitter)
            .catch((e) => {
                this.logger.error('Error occurred while polling spotify, polling has been stopped');
                this.logger.error(e);
            })
            .finally(() => {
                this.pollerRunning = false;
            });
    }
}

const pollSpotify = function* (logger, source, interval = 60, credsPath, clients, emitter) {
    logger.info('Starting spotify polling');
    let lastTrackPlayedAt = dayjs();
    let checkCount = 0;
    while (true) {
        let playObjs = [];
        logger.debug('Refreshing recently played')
        playObjs = yield source.getRecentlyPlayed({formatted: true});
        if (playObjs instanceof Error) {
            return Promise.reject(playObjs);
        }
        checkCount++;
        let newTracksFound = false;
        let closeToInterval = false;
        const now = dayjs();

        const playInfo = playObjs.reduce((acc, playObj) => {
            const {data: {playDate} = {}} = playObj;
            if (playDate.unix() > lastTrackPlayedAt.unix()) {
                newTracksFound = true;
                logger.info(`New Track => ${buildTrackString(playObj)}`);

                if (closeToInterval === false) {
                    closeToInterval = Math.abs(now.unix() - playDate.unix()) < 5;
                }

                return {
                    plays: [...acc.plays, {...playObj, meta: {...playObj.meta, newFromSource: true}}],
                    lastTrackPlayedAt: playDate
                }
            }
            return {
                ...acc,
                plays: [...acc.plays, playObj]
            }
        }, {plays: [], lastTrackPlayedAt});
        playObjs = playInfo.plays;
        lastTrackPlayedAt = playInfo.lastTrackPlayedAt;

        if (closeToInterval) {
            // because the interval check was so close to the play date we are going to delay client calls for a few secs
            // this way we don't accidentally scrobble ahead of any other clients (we always want to be behind so we can check for dups)
            // additionally -- it should be ok to have this in the for loop because played_at will only decrease (be further in the past) so we should only hit this once, hopefully
            logger.info('Track is close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first');
            yield sleep(10 * 1000);
        }

        if (newTracksFound === false) {
            if (playObjs.length === 0) {
                logger.debug(`No new tracks found and no tracks returned from API`);
            } else {
                logger.debug(`No new tracks found. Newest track returned was ${buildTrackString(playObjs.slice(-1)[0])}`);
            }
        } else {
            checkCount = 0;
        }

        const scrobbleResult = yield clients.scrobble(playObjs, {forceRefresh: closeToInterval, source: 'Spotify'});
        if (scrobbleResult instanceof Error) {
            return Promise.reject(scrobbleResult);
        } else if (scrobbleResult.length > 0) {
            checkCount = 0;
            for (const t of scrobbleResult) {
                emitter.emit('spotifyTrackDiscovered', t);
            }
        }

        let sleepTime = interval;
        // don't need to do back off calc if interval is 10 minutes or greater since its already pretty light on API calls
        // and don't want to back off if we just started the app
        if (checkCount > 5 && sleepTime < 600) {
            const lastPlayToNowSecs = Math.abs(now.unix() - lastTrackPlayedAt.unix());
            // back off if last play was longer than 10 minutes ago
            const backoffThreshold = Math.min((interval * 10), 600);
            if (lastPlayToNowSecs >= backoffThreshold) {
                // back off to a maximum of 5 minutes
                sleepTime = Math.min(interval * 5, 300);
            }
        }

        // sleep for interval
        logger.debug(`Sleeping for ${sleepTime}s`);
        yield sleep(sleepTime * 1000);
    }
};
