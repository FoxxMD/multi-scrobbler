import fs from "fs";
import {addAsync} from '@awaitjs/express';
import express from 'express';
import winston from 'winston';
import {Writable} from 'stream';
import 'winston-daily-rotate-file';
import {readJson, sleep, writeFile, buildTrackString} from "./utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import MalojaScrobbler from "./clients/MalojaScrobbler.js";

const {format, createLogger, transports} = winston;
const {combine, printf, timestamp} = format;

let output = []
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    output.unshift(chunk.toString());
    output = output.slice(0, 51);
    next()
}
const streamTransport = new winston.transports.Stream({stream})

const myFormat = printf(({level, message, label = 'App', timestamp}) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = createLogger({
    level: 'debug',
    format: combine(
        timestamp(),
        myFormat
    ),
    transports: [
        new transports.Console(),
        streamTransport,
    ]
});

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';
let lastTrackPlayedAt = new Date();

const configDir = process.env.CONFIG_DIR || `${process.cwd()}/config`;
const configLocation = process.env.CONFIG_PATH || `${configDir}/config.json`;

const app = addAsync(express());

try {
    (async function () {

        let spotifyAsyncFunc = null;

        // try to read a configuration file
        let config = {};
        try {
            config = await readJson(configLocation);
        } catch (e) {
            logger.warn('Could not read config file');
            logger.error(e);
        }

        // setup defaults for other configs and general config
        const {
            logPath: logPathRaw = process.env.LOG_PATH || true,
            interval = 60,
            port = process.env.PORT ?? 9078,
            spotify: spotifyConfigRaw = process.env.SPOTIFY_CONFIG_PATH || `${configDir}/spotify.json`,
            clients = [],
        } = config || {};

        const localUrl = `http://localhost:${port}`;

        // first thing, if user wants to log to file set it up now
        if (logPathRaw !== false) {
            let logPath = `${process.cwd()}/logs`;
            if (typeof logPathRaw === 'string') {
                logPath = logPathRaw;
            }
            logger.add(new winston.transports.DailyRotateFile({
                level: 'info', // don't need to add a bunch of noise to files
                dirname: logPath,
                createSymlink: true,
                symlinkName: 'scrobble-current.log',
                filename: 'scrobble-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '5m'
            }))
        }

        if (interval < 15) {
            console.warn('Interval should be above 30 seconds...😬');
        }

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson('./spotifyCreds.json');
        } catch (e) {
            logger.warn('Current spotify access token was not parsable or file does not exist (this could be normal)');
        }

        let spotifyConfig = spotifyConfigRaw;
        if (typeof spotifyConfigRaw === 'string') {
            try {
                spotifyConfig = await readJson(spotifyConfigRaw);
            } catch (e) {
                logger.warn('Could not read spotify config file');
                logger.error(e);
            }
        }

        const {
            accessToken = process.env.SPOTIFY_ACCESS_TOKEN,
            clientId = process.env.SPOTIFY_CLIENT_ID,
            clientSecret = process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri = process.env.SPOTIFY_REDIRECT_URI,
            refreshToken = process.env.SPOTIFY_REFRESH_TOKEN,
        } = spotifyConfig;

        const rdUri = redirectUri || `${localUrl}/callback`;


        const {token = accessToken, refreshToken: rt = refreshToken} = spotifyCreds;

        if (token === undefined) {
            if (clientId === undefined) {
                throw new Error('ClientId not defined');
            }
            if (clientSecret === undefined) {
                throw new Error('ClientSecret not defined');
            }
        }

        const spotifyApi = new SpotifyWebApi({
            clientId,
            clientSecret,
            accessToken: token,
            redirectUri: rdUri,
            refreshToken: rt,
        });

        const scrobbleClients = await createClients(clients, configDir);
        if (scrobbleClients.length === 0) {
            throw new Error('No scrobble clients were configured');
        }


        app.getAsync('/authSpotify', async function (req, res) {
            logger.info('Redirecting to spotify authorization url');
            res.redirect(spotifyApi.createAuthorizeURL(scopes, state));
        });

        app.postAsync('/pollSpotify', async function (req, res) {
            spotifyAsyncFunc = pollSpotify(spotifyApi, interval, scrobbleClients);
            res.send('OK');
        });

        app.getAsync(`/callback`, async function (req, res, next) {
            const {error, code} = req.query;
            if (error === undefined) {
                const tokenResponse = await spotifyApi.authorizationCodeGrant(code);
                spotifyApi.setAccessToken(tokenResponse.body['access_token']);
                spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
                await writeFile('spotifyCreds.json', JSON.stringify({
                    token: tokenResponse.body['access_token'],
                    refreshToken: tokenResponse.body['refresh_token']
                }));
                logger.info('Got auth code from callback!');
                spotifyAsyncFunc = pollSpotify(spotifyApi, interval, scrobbleClients);
                return res.send('OK');
            } else {
                throw new Error('User denied oauth access');
            }
        });

        if (token === undefined) {
            logger.info('No access token found');
            logger.info(`Open ${localUrl}/authSpotify to continue`);
        } else {
            spotifyAsyncFunc = pollSpotify(spotifyApi, interval, scrobbleClients)
            logger.info(`Server started at ${localUrl}`);
        }

        const server = await app.listen(port)
    }());
} catch (e) {
    logger.error('Exited with uncaught error');
    logger.error(e);
}

const pollSpotify = async function (spotifyApi, interval = 60, clients = []) {
    logger.info('Starting spotify polling', {label: 'Spotify'});
    try {
        while (true) {
            let data = {};
            logger.debug('Refreshing recently played', {label: 'Spotify'})
            try {
                data = await spotifyApi.getMyRecentlyPlayedTracks({
                    limit: 20
                });
            } catch (e) {
                if (e.statusCode === 401) {
                    logger.info('Access token was not valid, attempting to refresh', {label: 'Spotify'});
                    const tokenResponse = await spotifyApi.refreshAccessToken();
                    const {body: {
                        access_token,
                        // spotify may return a new refresh token
                        // if it doesn't then continue to use the last refresh token we received
                        refresh_token = spotifyApi.getRefreshToken(),
                    } = {}} = tokenResponse;
                    spotifyApi.setAccessToken(access_token);
                    await writeFile('spotifyCreds.json', JSON.stringify({
                        token: access_token,
                        refreshToken: refresh_token,
                    }));
                    data = await spotifyApi.getMyRecentlyPlayedTracks({
                        limit: 20
                    });
                } else {
                    throw e;
                }
            }
            let newLastPLayedAt = undefined;
            const now = new Date();
            for (const playObj of data.body.items) {
                const {track: {name: trackName, duration_ms }, played_at} = playObj;
                const playDate = new Date(played_at);
                // compare play time to most recent track played_at scrobble
                if (playDate.getTime() > lastTrackPlayedAt.getTime()) {
                    logger.info(`New Track => ${buildTrackString(playObj)}`, {label: 'Spotify'});
                    // so we always get just the most recent played_at
                    if (newLastPLayedAt === undefined) {
                        newLastPLayedAt = playDate;
                    }
                    const closeToInterval = Math.abs(now.getTime() - playDate.getTime()) / 1000 < 5;
                    if (closeToInterval) {
                        // because the interval check was so close to the play date we are going to delay client calls for a few secs
                        // this way we don't accidentally scrobble ahead of any other clients (we always want to be behind so we can check for dups)
                        // additionally -- it should be ok to have this in the for loop because played_at will only decrease (be further in the past) so we should only hit this once, hopefully
                        logger.info('Track is close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first', {label: 'Spotify'});
                        await sleep(10 * 1000);
                    }
                    for (const client of clients) {
                        if (closeToInterval || client.scrobblesLastCheckedAt().getTime() < now.getTime()) {
                            await client.refreshScrobbles();
                        }
                        if (!client.alreadyScrobbled(trackName, playDate, duration_ms / 1000)) {
                            await client.scrobble(playObj);
                        }
                    }
                } else {
                    break;
                }
                if (newLastPLayedAt !== undefined) {
                    lastTrackPlayedAt = newLastPLayedAt;
                }
            }
            // sleep for interval
            logger.debug(`Sleeping for interval (${interval}s)`, {label: 'Spotify'});
            await sleep(interval * 1000);
        }
    } catch (e) {
        logger.error('Error occurred while in spotify polling loop', {label: 'Spotify'});
        logger.error(e, {label: 'Spotify'});
    }
};


const createClients = async function (clientConfigs = [], configDir = '.') {
    const clients = [];
    for (const config of clientConfigs) {
        const dataType = typeof config;
        if (!['object', 'string'].includes(dataType)) {
            throw new Error('All client configs must be objects or strings');
        }
        const clientType = dataType === 'string' ? config : config.type;
        switch (clientType) {
            case 'maloja':
                let data = `${configDir}/maloja.json`;
                if (dataType === 'object') {
                    const {data: dataProp = process.env.MALOJA_CONFIG_PATH || `${configDir}/maloja.json`} = config;
                    data = dataProp;
                }
                let malojaConfig;
                if (typeof data === 'string') {
                    try {
                        malojaConfig = await readJson(data);
                    } catch (e) {
                        logger.warn('Maloja config was not parsable or file does not exist');
                    }
                } else {
                    malojaConfig = data;
                }
                const {
                    url = process.env.MALOJA_URL,
                    apiKey = process.env.MALOJA_API_KEY
                } = malojaConfig;
                if (url === undefined && apiKey === undefined) {
                    // the user probably didn't set anything up for this client at all, don't log
                    continue;
                }
                if (url === undefined) {
                    logger.warn('Maloja url not found in config');
                    continue;
                }
                if (apiKey === undefined) {
                    logger.warn('Maloja api key not found in config');
                    continue;
                }
                clients.push(new MalojaScrobbler(logger, malojaConfig));
                break;
            default:
                break;
        }
    }
    return clients;
}
