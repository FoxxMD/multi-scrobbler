import {addAsync} from '@awaitjs/express';
import express from 'express';
import bodyParser from 'body-parser';
import winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {Writable} from 'stream';
import 'winston-daily-rotate-file';
import {readJson, writeFile } from "./utils.js";
import Clients from './clients/ScrobbleClients.js';
import SpotifySource from "./sources/SpotifySource.js";
import TautulliSource from "./sources/TautulliSource.js";

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

const configDir = process.env.CONFIG_DIR || `${process.cwd()}/config`;
const workingCredentialsPath = `${configDir}/currentCreds.json`;

const app = addAsync(express());

app.use(bodyParser.json());

try {
    (async function () {

        // try to read a configuration file
        let config = {};
        try {
            config = await readJson(`${configDir}/config.json`);
        } catch (e) {
            logger.info('No config file or could not be read (normal if using ENV vars only)');
        }

        // setup defaults for other configs and general config
        const {
            spotify,
            clients = [],
        } = config || {};

        const spotifySource = new SpotifySource(logger, {configDir, localUrl});
        await spotifySource.buildSpotifyApi(spotify);

        const scrobbleClients = new Clients(logger);
        await scrobbleClients.buildClients(clients, configDir);
        if (scrobbleClients.clients.length === 0) {
            logger.warn('No scrobble clients were configured')
        }

        const tautulliSource = new TautulliSource(logger, scrobbleClients);

        app.getAsync('/', async function (req, res) {
            res.render('status', {
                spotify: {
                    status: spotifySource.pollerRunning,
                    discovered: spotifySource.discoveredTracks,
                },
                tautulli: {
                    status: tautulliSource.discoveredTracks > 0 ? 'Received Data' : 'Awaiting Data',
                    discovered: tautulliSource.discoveredTracks,
                },
                logs: output
            });
        })

        app.postAsync('/tautulli', async function (req, res) {
            await tautulliSource.handle(req);
            res.send('OK');
        });

        app.getAsync('/authSpotify', async function (req, res) {
            logger.info('Redirecting to spotify authorization url');
            res.redirect(spotifySource.spotifyApi.createAuthorizeURL(scopes, state));
        });

        app.getAsync('/pollSpotify', async function (req, res) {
            spotifySource.pollSpotify(scrobbleClients);
            res.send('OK');
        });

        app.getAsync(/.*callback$/, async function (req, res, next) {
            const {error, code} = req.query;
            if (error === undefined) {
                const tokenResponse = await spotifySource.spotifyApi.authorizationCodeGrant(code);
                spotifySource.spotifyApi.setAccessToken(tokenResponse.body['access_token']);
                spotifySource.spotifyApi.setRefreshToken(tokenResponse.body['refresh_token']);
                await writeFile(workingCredentialsPath, JSON.stringify({
                    token: tokenResponse.body['access_token'],
                    refreshToken: tokenResponse.body['refresh_token']
                }));
                logger.info('Got auth code from callback!');
                spotifySource.pollSpotify(scrobbleClients);
                return res.send('OK');
            } else {
                throw new Error('User denied oauth access');
            }
        });

        if (spotifySource.spotifyApi !== undefined) {
            if (spotifySource.spotifyApi.getAccessToken() === undefined) {
                logger.info('Spotify Api is not ready');
                logger.info(`Open ${localUrl}/authSpotify to continue`);
            } else {
                spotifySource.pollSpotify(scrobbleClients);
            }
        }
        app.set('views', './views');
        app.set('view engine', 'ejs');
        logger.info(`Server started at ${localUrl}`);
        const server = await app.listen(port)
    }());
} catch (e) {
    logger.error('Exited with uncaught error');
    logger.error(e);
}
