import fs from "fs";
import {addAsync} from '@awaitjs/express';
import express from 'express';
import winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {Writable} from 'stream';
import 'winston-daily-rotate-file';
import {readJson, sleep, writeFile, buildTrackString} from "./utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import MalojaScrobbler from "./clients/MalojaScrobbler.js";

dayjs.extend(utc)

const {format, createLogger, transports} = winston;
const {combine, printf, timestamp} = format;

let output = []
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    output.unshift(chunk.toString().replace('\n', ''));
    output = output.slice(0, 51);
    next()
}
const streamTransport = new winston.transports.Stream({
    stream,
    level: process.env.LOG_LEVEL || 'info',
})

const logPath = process.env.LOG_DIR || `${process.cwd()}/logs`;
const port = process.env.PORT ?? 9078;
const localUrl = `http://localhost:${port}`;

const myFormat = printf(({level, message, label = 'App', timestamp}) => {
    return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp(
            {
                format: () => dayjs().local().format(),
            }
        ),
        myFormat
    ),
    transports: [
        new transports.Console({
            level: process.env.LOG_LEVEL || 'info',
        }),
        streamTransport,
    ]
});

if (typeof logPath === 'string') {
    logger.add(new winston.transports.DailyRotateFile({
        level: process.env.LOG_LEVEL || 'info',
        dirname: logPath,
        createSymlink: true,
        symlinkName: 'scrobble-current.log',
        filename: 'scrobble-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '5m'
    }))
}

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';
let lastTrackPlayedAt = undefined;

const configDir = process.env.CONFIG_DIR || `${process.cwd()}/config`;
const workingCredentialsPath = `${configDir}/currentCreds.json`;

const app = addAsync(express());

try {
    (async function () {

        let spotifyAsyncFunc = null;

        // try to read a configuration file
        let config = {};
        try {
            config = await readJson(`${configDir}/config.json`);
        } catch (e) {
            logger.info('No config file or could not be read (normal if using ENV vars only)');
        }

        // setup defaults for other configs and general config
        const {
            interval = 60,
            spotify,
            clients = [],
        } = config || {};

        if (interval < 15) {
            console.warn('Interval should be above 30 seconds...😬');
        }

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson(workingCredentialsPath);
        } catch (e) {
            logger.warn('Current spotify access token was not parsable or file does not exist (this could be normal)');
        }

        let spotifyConfig = spotify;
        if (spotify === undefined) {
            try {
                spotifyConfig = await readJson(`${configDir}/spotify.json`);
            } catch (e) {
                logger.warn('No spotify config file or could not be read (normal if using ENV vars only)');
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

        app.getAsync('/', async function (req, res) {
            res.render('status', {
                status: spotifyAsyncFunc !== null ? 'Connected' : 'Awaiting Authorization',
                authUrl: spotifyAsyncFunc !== null ? null : `${localUrl}/authSpotify`,
                logs: output
            });
        })

        app.getAsync('/authSpotify', async function (req, res) {
            logger.info('Redirecting to spotify authorization url');
            res.redirect(spotifyApi.createAuthorizeURL(scopes, state));
        });

        app.postAsync('/pollSpotify', async function (req, res) {
            spotifyAsyncFunc = pollSpotify(spotifyApi, interval, scrobbleClients);
            res.send('OK');
        });

        app.getAsync(/.*callback$/, async function (req, res, next) {
            const {error, code} = req.query;
            if (error === undefined) {
                const tokenResponse = await spotifyApi.authorizationCodeGrant(code);
                spotifyApi.setAccessToken(tokenResponse.body['access_token']);
                spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
                await writeFile(workingCredentialsPath, JSON.stringify({
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

        app.set('views', './views');
        app.set('view engine', 'ejs');
        const server = await app.listen(port)
    }());
} catch (e) {
    logger.error('Exited with uncaught error');
    logger.error(e);
}

const pollSpotify = async function (spotifyApi, interval = 60, clients = []) {
    logger.info('Starting spotify polling', {label: 'Spotify'});
    try {
        let checkCount = 0;
        while (true) {
            let data = {};
            logger.debug('Refreshing recently played', {label: 'Spotify'})
            try {
                data = await spotifyApi.getMyRecentlyPlayedTracks({
                    limit: 20
                });
            } catch (e) {
                if (e.statusCode === 401) {
                    if (spotifyApi.getRefreshToken() === undefined) {
                        throw new Error('Access token was not valid and no refresh token was present, bailing out of polling')
                    }
                    logger.debug('Access token was not valid, attempting to refresh', {label: 'Spotify'});
                    try {
                        const tokenResponse = await spotifyApi.refreshAccessToken();
                        const {
                            body: {
                                access_token,
                                // spotify may return a new refresh token
                                // if it doesn't then continue to use the last refresh token we received
                                refresh_token = spotifyApi.getRefreshToken(),
                            } = {}
                        } = tokenResponse;
                        spotifyApi.setAccessToken(access_token);
                        await writeFile(workingCredentialsPath, JSON.stringify({
                            token: access_token,
                            refreshToken: refresh_token,
                        }));
                        data = await spotifyApi.getMyRecentlyPlayedTracks({
                            limit: 20
                        });
                    } catch (err) {
                        logger.error('Refreshing access token encountered an error', {label: 'Spotify'});
                        throw err;
                    }
                } else {
                    throw e;
                }
            }
            checkCount++;
            let newLastPLayedAt = undefined;
            const now = new Date();
            for (const playObj of data.body.items) {
                const {track: {name: trackName, duration_ms}, played_at} = playObj;
                const playDate = new Date(played_at);
                if (lastTrackPlayedAt === undefined) {
                    lastTrackPlayedAt = playDate;
                }
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
            let sleepTime = interval;
            // don't need to do back off calc if interval is 10 minutes or greater since its already pretty light on API calls
            // and don't want to back off if we just started the app
            if (checkCount > 5 && sleepTime < 600) {
                const lastPlayToNowSecs = Math.abs(now.getTime() - lastTrackPlayedAt.getTime()) / 1000;
                // back off if last play was longer than 10 minutes ago
                const backoffThreshold = Math.min((interval * 10), 600);
                if (lastPlayToNowSecs >= backoffThreshold) {
                    // back off to a maximum of 5 minutes
                    sleepTime = Math.min(interval * 5, 300);
                }
            }

            // sleep for interval
            logger.debug(`Sleeping for interval (${sleepTime}s)`, {label: 'Spotify'});
            await sleep(sleepTime * 1000);
        }
    } catch (e) {
        logger.error('Error occurred while in spotify polling loop', {label: 'Spotify'});
        logger.error(e, {label: 'Spotify'});
    }
};


const createClients = async function (clientConfigs = [], configDir = '.') {
    const clients = [];
    if (!clientConfigs.every(x => typeof x === 'object')) {
        throw new Error('All client from config json must be objects');
    }
    for (const clientType of ['maloja']) {

        let clientConfig = {};

        switch (clientType) {
            case 'maloja':
                clientConfig = clientConfigs.find(x => x.type === 'maloja') || {
                    url: process.env.MALOJA_URL,
                    apiKey: process.env.MALOJA_API_KEY
                };

                if (Object.values(clientConfig).every(x => x === undefined)) {
                    try {
                        clientConfig = await readJson(`${configDir}/maloja.json`);
                    } catch (e) {
                        // no config exists, skip this client
                        continue;
                    }
                }

                const {
                    url,
                    apiKey
                } = clientConfig;

                if (url === undefined) {
                    logger.warn('Maloja url not found in config');
                    continue;
                }
                if (apiKey === undefined) {
                    logger.warn('Maloja api key not found in config');
                    continue;
                }
                clients.push(new MalojaScrobbler(logger, clientConfig));
                break;
            default:
                break;
        }
    }
    return clients;
}
