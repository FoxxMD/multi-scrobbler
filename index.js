import fs from "fs";
import {addAsync} from '@awaitjs/express';
import express from 'express';
import open from 'open';
import {readJson, sleep, writeFile, buildTrackString, consoleToLog} from "./utils.js";
import SpotifyWebApi from "spotify-web-api-node";
import MalojaScrobbler from "./clients/MalojaScrobbler.js";

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';
let lastTrackPlayedAt = new Date();

const configDir = process.env.CONFIG_DIR || `${process.cwd()}/config`;
const configLocation = process.env.CONFIG_PATH || `${configDir}/config.json`;

const app = addAsync(express());

try {
    (async function () {

        // try to read a configuration file
        let config = {};
        try {
            config = await readJson(configLocation);
        } catch (e) {
            console.warn('[WARN] Could not read config file');
            console.error(e);
        }

        // setup defaults for other configs and general config
        const {
            logPath = process.env.LOG_PATH || true,
            interval = 60,
            port = process.env.PORT ?? 9078,
            spotify: spotifyConfigRaw = process.env.SPOTIFY_CONFIG_PATH || `${configDir}/spotify.json`,
            clients = [],
        } = config || {};

        const localUrl = `http://localhost:${port}`;

        // first thing, if user wants to log to file set it up now
        if (logPath !== false) {
            const logPathPrefix = typeof logPath === 'string' ? logPath : `${process.cwd()}/logs`;
            consoleToLog(logPathPrefix);
        }

        let spotifyCreds = {};
        try {
            spotifyCreds = await readJson('./spotifyCreds.json');
        } catch (e) {
            console.log('[WARN] Current spotify access token was not parsable or file does not exist (this could be normal)');
        }

        let spotifyConfig = spotifyConfigRaw;
        if (typeof spotifyConfigRaw === 'string') {
            try {
                spotifyConfig = await readJson(spotifyConfigRaw);
            } catch (e) {
                console.warn('[WARN] Could not read spotify config file');
                console.error(e);
            }
        }

        const {
            accessToken = process.env.SPOTIFY_ACCESS_TOKEN,
            clientId = process.env.SPOTIFY_CLIENT_ID,
            clientSecret = process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri = process.env.SPOTIFY_REDIRECT_URI,
            refreshToken = process.env.SPOTIFY_REFRESH_TOKEN,
            callbackPath = process.env.SPOTIFY_RELATIVE_CALLBACK_URI ?? 'callback',
        } = spotifyConfig;

        const rdUri = redirectUri || `${localUrl}/${callbackPath}`;


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
            console.log('[INFO] Redirecting to spotify authorization url');
            res.redirect(spotifyApi.createAuthorizeURL(scopes, state));
        });

        app.getAsync(`/${callbackPath}`, async function (req, res, next) {
            const {error, code} = req.query;
            if (error === undefined) {
                const tokenResponse = await spotifyApi.authorizationCodeGrant(code);
                spotifyApi.setAccessToken(tokenResponse.body['access_token']);
                spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
                await writeFile('spotifyCreds.json', JSON.stringify({
                    token: tokenResponse.body['access_token'],
                    refreshToken: tokenResponse.body['refresh_token']
                }));
                initSpotify(spotifyApi, interval, scrobbleClients);
            } else {
                throw new Error('User denied oauth access');
            }
        });

        if (token === undefined) {
            console.log('[INFO] No access token found, attempting to open spotify authorization url');
            const url = spotifyApi.createAuthorizeURL(scopes, state);
            try {
                await open(url);
            } catch (e) {
                // could not open browser or some other issue (maybe it does not exist? could be on docker)
                console.log(`[WARN] Could not open browser! Open ${localUrl}/spotifyAuth to continue`);
            }
        } else {
            initSpotify(spotifyApi, interval, scrobbleClients)
        }

        console.log(`[INFO] Server started at ${localUrl}`);
        const server = await app.listen(port)
    }());
} catch (e) {
    console.log('[ERROR] Exited with uncaught error');
    console.error(e);
}

const initSpotify = async function (spotifyApi, interval = 60, clients = []) {
    while (true) {
        let data = {};
        try {
            data = await spotifyApi.getMyRecentlyPlayedTracks({
                limit: 20
            });
        } catch (e) {
            if(e.statusCode === 401) {
                console.log('[INFO] Access token was not valid, attempting to refresh');
                await spotifyApi.refreshAccessToken();
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
            const {track: { name: trackName }, played_at} = playObj;
            const playDate = new Date(played_at);
            // compare play time to most recent track played_at scrobble
            if (playDate.getTime() > lastTrackPlayedAt.getTime()) {
                // TODO make sure the server hasn't already scrobbled this
                console.log(`[INFO] New Track:  ${buildTrackString(playObj)}`);
                // so we always get just the most recent played_at
                if (newLastPLayedAt === undefined) {
                    newLastPLayedAt = playDate;
                }
                for(const client of clients) {
                   if(client.scrobblesLastCheckedAt().getTime() < now.getTime()) {
                       await client.refreshScrobbles();
                   }
                   if(!client.alreadyScrobbled(trackName)) {
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
        // sleep for 1 minute
        await sleep(interval * 1000);
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
                        console.log('[WARN] Maloja config was not parsable or file does not exist');
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
                    console.log('[WARN] Maloja url not found in config');
                    continue;
                }
                if (apiKey === undefined) {
                    console.log('[WARN] Maloja api key not found in config');
                    continue;
                }
                clients.push(new MalojaScrobbler(malojaConfig));
                break;
            default:
                break;
        }
    }
    return clients;
}
