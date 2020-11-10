import fs from "fs";
import {readJson, formatDate, readText, writeFile, hook_stream} from "./utils.js";
import SpotifyWebApi from "spotify-web-api-node";

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

try {
    (async function () {

        const configLocation = process.env.CONFIGDIR || './config.json';
        let config = undefined;
        try {
            config = await readJson(configLocation);
        } catch (e) {
            console.warn('[WARN] Could not read config file');
            console.error(e);
        }

        const {
            accessToken = process.env.ACCESSTOKEN,
            clientId = process.env.CLIENTID,
            clientSecret = process.env.CLIENTSECRET
        } = config || {};

        let usedToken = accessToken;

        if (usedToken === undefined) {
            try {
                usedToken = await readText('token.txt');
            } catch (e) {
                console.log('[WARN] Current access token was parsable or file does not exist (this could be normal)');
            }
        }

        if (clientId === undefined && usedToken === undefined) {
            throw new Error('ClientId not defined');
        }
        if (clientSecret === undefined && usedToken === undefined) {
            throw new Error('ClientSecret not defined');
        }

        const spotifyApi = new SpotifyWebApi({
            clientId,
            clientSecret,
            accessToken: usedToken,
        });

        if (usedToken === undefined) {
            const creds = await spotifyApi.clientCredentialsGrant();
            usedToken = creds.body['access_token'];
            await writeFile('token.txt', usedToken);
            spotifyApi.setAccessToken(usedToken);
        }

        while (true) {
            const tracks = await spotifyApi.getMyRecentlyPlayedTracks({
                limit: 20
            });
            const f = 1;
        }


    }());
} catch (e) {
    console.log('[ERROR] Exited with uncaught error');
    console.error(e);
}
