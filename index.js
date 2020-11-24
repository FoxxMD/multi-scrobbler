import {addAsync} from '@awaitjs/express';
import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';
import winston from 'winston';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import {Writable} from 'stream';
import 'winston-daily-rotate-file';
import {labelledFormat, readJson } from "./utils.js";
import Clients from './clients/ScrobbleClients.js';
import SpotifySource from "./sources/SpotifySource.js";
import TautulliSource from "./sources/TautulliSource.js";
import PlexSource from "./sources/PlexSource.js";

const storage = multer.memoryStorage()
const upload = multer({storage: storage})

dayjs.extend(utc)
dayjs.extend(isBetween);

const {transports} = winston;

let output = []
const stream = new Writable()
stream._write = (chunk, encoding, next) => {
    output.unshift(chunk.toString().replace('\n', ''));
    output = output.slice(0, 101);
    next()
}
const streamTransport = new winston.transports.Stream({
    stream,
})

const logConfig = {
    level: process.env.LOG_LEVEL || 'info',
    sort: 'descending',
    limit: 50,
}

const availableLevels = ['info','debug'];
const logPath = process.env.LOG_DIR || `${process.cwd()}/logs`;
const port = process.env.PORT ?? 9078;
const localUrl = `http://localhost:${port}`;

const rotateTransport = new winston.transports.DailyRotateFile({
    dirname: logPath,
    createSymlink: true,
    symlinkName: 'scrobble-current.log',
    filename: 'scrobble-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '5m'
});

const consoleTransport = new transports.Console();

const myTransports = [
    consoleTransport,
    streamTransport,
];

if (typeof logPath === 'string') {
    myTransports.push(rotateTransport);
}

const loggerOptions = {
    level: logConfig.level,
    format: labelledFormat(),
    transports: myTransports,
};

winston.loggers.add('default', loggerOptions);

const logger = winston.loggers.get('default');

const configDir = process.env.CONFIG_DIR || `${process.cwd()}/config`;

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
            plex = {},
            clients = [],
        } = config || {};

        /*
        * setup clients
        * */
        const scrobbleClients = new Clients();
        await scrobbleClients.buildClients(clients, configDir);
        if (scrobbleClients.clients.length === 0) {
            logger.warn('No scrobble clients were configured')
        }

        /*
        * setup sources
        * */
        const spotifySource = new SpotifySource({configDir, localUrl});
        await spotifySource.buildSpotifyApi(spotify);

        let plexJson = {};
        try {
            plexJson = await readJson(`${configDir}/plex.json`);
        } catch (e) {
            // no config exists but that's ok
        }

        const tautulliSource = await new TautulliSource(scrobbleClients, {...plex, ...plexJson});
        const plexSource = await new PlexSource(scrobbleClients, {...plex, ...plexJson});

        app.getAsync('/', async function (req, res) {
            let slicedLog = output.slice(0, logConfig.limit + 1);
            if(logConfig.sort === 'ascending') {
                slicedLog.reverse();
            }
            res.render('status', {
                spotify: {
                    status: spotifySource.pollerRunning,
                    discovered: spotifySource.discoveredTracks,
                },
                tautulli: {
                    status: tautulliSource.discoveredTracks > 0 ? 'Received Data' : 'Awaiting Data',
                    discovered: tautulliSource.discoveredTracks,
                },
                plex: {
                    status: plexSource.discoveredTracks > 0 ? 'Received Data' : 'Awaiting Data',
                    discovered: plexSource.discoveredTracks,
                },
                logs: {
                    output: slicedLog,
                    limit: [10,20,50,100].map(x => `<a class="capitalize ${logConfig.limit === x ? 'bold' : ''}" href="logs/settings/update?limit=${x}">${x}</a>`).join(' | '),
                    sort: ['ascending', 'descending'].map(x => `<a class="capitalize ${logConfig.sort === x ? 'bold' : ''}" href="logs/settings/update?sort=${x}">${x}</a>`).join(' | '),
                    level: availableLevels.map(x => `<a class="capitalize ${logConfig.level === x ? 'bold' : ''}" href="logs/settings/update?level=${x}">${x}</a>`).join(' | ')
                }
            });
        })

        app.postAsync('/tautulli', async function (req, res) {
            await tautulliSource.handle(TautulliSource.formatPlayObj(req.body, true));
            res.send('OK');
        });

        app.postAsync('/plex', upload.any(), async function (req, res) {
            const {
                body: {
                    payload
                } = {}
            } = req;
            if (payload !== undefined) {
                await plexSource.handle(PlexSource.formatPlayObj(JSON.parse(payload), true));
            }
            res.send('OK');
        });

        app.getAsync('/authSpotify', async function (req, res) {
            logger.info('Redirecting to spotify authorization url');
            res.redirect(spotifySource.createAuthUrl());
        });

        app.getAsync('/pollSpotify', async function (req, res) {
            spotifySource.pollSpotify(scrobbleClients);
            res.send('OK');
        });

        app.getAsync('/logs/settings/update', async function (req, res) {
            const e = req.query;
            for(const [setting, val] of Object.entries(req.query)) {
                switch(setting) {
                    case 'limit':
                        logConfig.limit = Number.parseInt(val);
                        break;
                    case 'sort':
                        logConfig.sort = val;
                        break;
                    case 'level':
                        logConfig.level = val;
                        for(const [key, logger] of winston.loggers.loggers) {
                            logger.level = val;
                        }
                        break;
                }
            }
            res.send('OK');
        });

        app.getAsync(/.*callback$/, async function (req, res, next) {
            logger.info('Received auth code callback from Spotify', { label: 'Spotify' });
            const tokenResult = await spotifySource.handleAuthCodeCallback(req.query);
            let responseContent = 'OK';
            if(tokenResult === true) {
                spotifySource.pollSpotify(scrobbleClients);
            } else {
                responseContent = tokenResult;
            }
            return res.send(responseContent);
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
