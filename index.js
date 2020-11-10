import fs from "fs";
import {addAsync} from '@awaitjs/express';
import express from 'express';
import open from 'open';
import {readJson, formatDate, sleep, writeFile, hook_stream, buildTrackString} from "./utils.js";
import SpotifyWebApi from "spotify-web-api-node";

const scopes = ['user-read-recently-played', 'user-read-currently-playing'];
const state = 'random';
let lastTrackPlayedAt = new Date();

let logStream;
try {
    logStream = fs.createWriteStream(`log-${formatDate()}.txt`, {flags: 'a'});
} catch (e) {
    console.error('Could not open log file for writing');
    console.error(e);
}

if (logStream !== undefined) {
    hook_stream(process.stdout, function (string, encoding, fd) {
        logStream.write(string, encoding)
    });
    hook_stream(process.stderr, function (string, encoding, fd) {
        logStream.write(string, encoding)
    })
}

const app = addAsync(express());

try {
    (async function () {

        const configLocation = process.env.CONFIGDIR || './config.json';
        let config = {};
        try {
            config = await readJson(configLocation);
        } catch (e) {
            console.warn('[WARN] Could not read config file');
            console.error(e);
        }

        let creds = {};
        try {
            creds = await readJson('./creds.json');
        } catch (e) {
            console.log('[WARN] Current access token was parsable or file does not exist (this could be normal)');
        }

        const {token = process.env.ACCESSTOKEN, refreshToken: rt = process.env.REFRESHTOKEN} = creds;

        const {
            accessToken = token,
            clientId = process.env.CLIENTID,
            clientSecret = process.env.CLIENTSECRET,
            redirectUri = process.env.REDIRECTURI,
            refreshToken = rt,
            port = process.env.PORT ?? 9078,
            callbackUrl = process.env.CALLBACKURL ?? 'callback',
        } = config || {};

        if (clientId === undefined && accessToken === undefined) {
            throw new Error('ClientId not defined');
        }
        if (clientSecret === undefined && accessToken === undefined) {
            throw new Error('ClientSecret not defined');
        }
        if (redirectUri === undefined && accessToken === undefined) {
            throw new Error('Redirect URI not defined');
        }

        const spotifyApi = new SpotifyWebApi({
            clientId,
            clientSecret,
            accessToken,
            redirectUri,
            refreshToken
        });

        app.getAsync(`/${callbackUrl}`, async function (req, res, next) {
            const {error, code} = req.query;
            if (error === undefined) {
                const tokenResponse = await spotifyApi.authorizationCodeGrant(code);
                spotifyApi.setAccessToken(tokenResponse.body['access_token']);
                spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
                await writeFile('creds.json', JSON.stringify({
                    token: tokenResponse.body['access_token'],
                    refreshToken: tokenResponse.body['refresh_token']
                }));
                initSpotify(spotifyApi);
            } else {
                throw new Error('User denied oauth access');
            }
        });

        if (accessToken === undefined) {
            const url = spotifyApi.createAuthorizeURL(scopes, state);
            await open(url);
        } else {
            initSpotify(spotifyApi)
        }

        const server = await app.listen(port)


    }());
} catch (e) {
    console.log('[ERROR] Exited with uncaught error');
    console.error(e);
}

const initSpotify = async function (spotifyApi) {
    while (true) {
        const data = await spotifyApi.getMyRecentlyPlayedTracks({
            limit: 20
        });
        let newLastScrobble = undefined;
        for (const playObj of data.body.items) {
            const {track, played_at} = playObj;
            const playDate = new Date(played_at);
            // compare play time to most recent track played_at scrobble
            if (playDate.getTime() > lastTrackPlayedAt.getTime()) {
                // TODO make sure the server hasn't already scrobbled this
                console.log(`[INFO] Scrobbling Track:  ${buildTrackString(playObj)}`);
                // so we always get just the most recent played_at
                if (newLastScrobble === undefined) {
                    newLastScrobble = playDate;
                }
            } else {
                break;
            }
            if (newLastScrobble !== undefined) {
                lastTrackPlayedAt = newLastScrobble;
            }
        }
        // sleep for 1 minute
        await sleep(60000);
    }
};
