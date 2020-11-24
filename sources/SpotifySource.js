import dayjs from "dayjs";
import {EventEmitter} from "events";
import {buildTrackString, readJson, sleep, writeFile, makeSingle, sortByPlayDate} from "../utils.js";
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
    name = 'Spotify';

    spotifyPoller;
    pollerRunning = false;

    emitter;
    discoveredTracks = 0;

    constructor(logger, config = {}) {
        this.logger = logger;
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
            } = {},
            played_at
        } = obj;
        let artistString = artists.reduce((acc, curr) => acc.concat(curr.name), []).join(',');
        return {
            data: {
                artist: artistString,
                track: name,
                playDate: dayjs(played_at),
            },
            meta: {
                trackLength: duration_ms / 1000,
                source: 'Spotify',
                newFromSource,
            }
        }
    }

    handleDiscoveredTrack = (e) => {
        this.discoveredTracks++;
    }

    buildSpotifyApi = async (spotifyObj) => {

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson(this.workingCredsPath);
        } catch (e) {
            this.logger.warn('Current spotify access token was not parsable or file does not exist (this could be normal)');
        }

        let spotifyConfig = spotifyObj;
        if (spotifyObj === undefined) {
            try {
                spotifyConfig = await readJson(`${this.configDir}/spotify.json`);
            } catch (e) {
                this.logger.warn('No spotify config file or could not be read (normal if using ENV vars only)');
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


        const {token = accessToken, refreshToken: rt = refreshToken} = spotifyCreds;

        const apiConfig = {
            clientId,
            clientSecret,
            accessToken: token,
            redirectUri: rdUri,
            refreshToken: rt,
        }

        if (Object.values(apiConfig).every(x => x === undefined)) {
            this.logger.info('No values found for Spotify configuration, assuming user does not want to set it up', {label: this.name});
        } else {
            if (token === undefined) {
                let ready = true;
                if (clientId === undefined) {
                    this.logger.warn('No access token exists and clientId is not defined', {label: this.name});
                    ready = false;
                }
                if (clientSecret === undefined) {
                    this.logger.warn('No access token exists and clientSecret is not defined', {label: this.name})
                    ready = false;
                }
                if (ready === false) {
                    return;
                }
            }

            this.spotifyApi = new SpotifyWebApi(apiConfig);
        }
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

    pollSpotify = (clients) => {
        if (this.spotifyApi === undefined) {
            this.logger.warn('Cannot poll spotify without valid credentials configuration', {label: this.name})
            return;
        }
        this.pollerRunning = true;
        return this.spotifyPoller(this.logger, this.spotifyApi, this.interval, this.workingCredsPath, clients, this.emitter)
            .catch((e) => {
                this.logger.error('Error occurred while polling spotify, polling has been stopped', {label: this.name});
                this.logger.error(e, {label: this.name});
            })
            .finally(() => {
                this.pollerRunning = false;
            });
    }
}

const pollSpotify = function* (logger, spotifyApi, interval = 60, credsPath, clients, emitter) {
    logger.info('Starting spotify polling', {label: 'Spotify'});
    let lastTrackPlayedAt = dayjs();
    let checkCount = 0;
    while (true) {
        let data = {};
        logger.debug('Refreshing recently played', {label: 'Spotify'})
        data = yield spotifyApi.getMyRecentlyPlayedTracks({
            limit: 20
        });
        if (data instanceof Error) {
            if (data.statusCode === 401) {
                if (spotifyApi.getRefreshToken() === undefined) {
                    logger.error('Access token was not valid and no refresh token was present, bailing out of polling', {label: 'Spotify'});
                    return Promise.resolve();
                }
                logger.debug('Access token was not valid, attempting to refresh', {label: 'Spotify'});

                const tokenResponse = yield spotifyApi.refreshAccessToken();
                const {
                    body: {
                        access_token,
                        // spotify may return a new refresh token
                        // if it doesn't then continue to use the last refresh token we received
                        refresh_token = spotifyApi.getRefreshToken(),
                    } = {}
                } = tokenResponse;
                spotifyApi.setAccessToken(access_token);
                yield writeFile(credsPath, JSON.stringify({
                    token: access_token,
                    refreshToken: refresh_token,
                }));
                data = yield spotifyApi.getMyRecentlyPlayedTracks({
                    limit: 20
                });
                if (data instanceof Error) {
                    logger.error('Refreshing access token encountered an error', {label: 'Spotify'});
                    logger.error(data, {label: 'Spotify'});
                    return Promise.resolve(data);
                }
            } else {
                logger.error('Refreshing access token encountered an error', {label: 'Spotify'});
                logger.error(data, {label: 'Spotify'});
                return Promise.reject(data);
            }
        }
        checkCount++;
        let newTracksFound = false;
        let closeToInterval = false;
        const now = dayjs();
        let playObjs = data.body.items.map(x => SpotifySource.formatPlayObj(x)).sort(sortByPlayDate);

        const playInfo = playObjs.reduce((acc, playObj) => {
            const {data: {playDate} = {}} = playObj;
            if (playDate.unix() > lastTrackPlayedAt.unix()) {
                newTracksFound = true;
                logger.info(`New Track => ${buildTrackString(playObj)}`, {label: 'Spotify'});

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
            logger.info('Track is close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first', {label: 'Spotify'});
            yield sleep(10 * 1000);
        }

        if (newTracksFound === false) {
            if (playObjs.length === 0) {
                logger.debug(`No new tracks found and no tracks returned from API`, {label: 'Spotify'});
            } else {
                logger.debug(`No new tracks found. Newest track returned was ${buildTrackString(playObjs.slice(-1)[0])}`, {label: 'Spotify'});
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
        logger.debug(`Sleeping for ${sleepTime}s`, {label: 'Spotify'});
        yield sleep(sleepTime * 1000);
    }
};
