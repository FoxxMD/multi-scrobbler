import { ExpressWithAsync } from "@awaitjs/express";
import { Logger } from "@foxxmd/logging";
import passport from "passport";
import { ExpressHandler } from "../common/infrastructure/Atomic.ts";
import LastfmScrobbler from "../scrobblers/LastfmScrobbler.ts";
import ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import LastfmSource from "../sources/LastfmSource.ts";
import ScrobbleSources from "../sources/ScrobbleSources.ts";
import SpotifySource from "../sources/SpotifySource.ts";
import YTMusicSource from "../sources/YTMusicSource.ts";
import { sortAndDeduplicateDiagnostics } from "typescript";
import { source } from "common-tags";

export const setupAuthRoutes = (app: ExpressWithAsync, logger: Logger, sourceMiddle: ExpressHandler, clientMiddle: ExpressHandler, scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {
    app.use('/api/client/auth', clientMiddle);
    app.getAsync('/api/client/auth', async (req, res) => {
        const {
            scrobbleClient,
        } = req as any;

        switch (scrobbleClient.type) {
            case 'lastfm':
                res.redirect(scrobbleClient.api.getAuthUrl());
                break;
            default:
                return res.status(400).send(`Specified client does not have auth implemented (${scrobbleClient.type})`);
        }
    });

    app.use('/api/source/auth', sourceMiddle);
    app.getAsync('/api/source/auth', async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleSource: source,
            // @ts-expect-error TS(2339): Property 'sourceName' does not exist on type 'Requ... Remove this comment to see the full error message
            sourceName: name,
        } = req;

        switch (source.type) {
            case 'spotify':
                if (source.spotifyApi === undefined) {
                    res.status(400).send('Spotify configuration is not valid');
                } else {
                    logger.info('Redirecting to spotify authorization url');
                    res.redirect(source.createAuthUrl());
                }
                break;
            case 'lastfm':
                res.redirect(source.api.getAuthUrl());
                break;
            case 'deezer':
                // @ts-expect-error TS(2339): Property 'deezerSource' does not exist on type 'Se... Remove this comment to see the full error message
                req.session.deezerSource = name;
                return passport.authenticate(`deezer-${source.name}`)(req,res,next);
            case 'ytmusic':
                await (source as YTMusicSource).reauthenticate();
                res.redirect((source as YTMusicSource).verificationUrl);
                break;
            default:
                return res.status(400).send(`Specified source does not have auth implemented (${source.type})`);
        }
    });

    app.getAsync(/.*callback$/, async (req, res, next) => {
        if(req.url.indexOf('/api') !== 0) {
            return res.redirect(307, `/api${req.url}`);
        }
        const {
            query: {
                state,
                name
            } = {}
        } = req;
        if (req.url.includes('lastfm')) {
            const {
                query: {
                    token
                } = {}
            } = req;
            let entity: LastfmScrobbler | LastfmSource | undefined = scrobbleClients.getByName(state) as (LastfmScrobbler | undefined);
            if(entity === undefined) {
                entity = scrobbleSources.getByName(state) as LastfmSource;
            }
            try {
                await entity.api.authenticate(token);
                entity.authFailure = false;
                if(entity instanceof LastfmSource) {
                    entity.poll().catch((e) => logger.error(e));
                } else {
                    entity.tryInitialize().catch((e) => logger.error(e));
                }
                return res.send('OK');
            } catch (e) {
                return res.send(e.message);
            }
        } else if(req.url.includes('ytmusic')) {
            const entity: YTMusicSource | undefined = scrobbleSources.getByName(name) as (YTMusicSource | undefined);
            if(entity === undefined) {
                logger.error(`No YTMUsic source with name ${state} was found`);
            }
            const result = await entity.handleAuthCodeCallback(req.query);
            let responseContent = 'OK';
            if(result === true) {
                entity.authFailure = false;
                entity.poll().catch((e) => logger.error(e));
            } else {
                responseContent = result;
            }
            return res.send(responseContent);
        } else {
            // TODO right now all sources requiring source interaction are covered by logic branches (deezer above and spotify here)
            // but eventually should update all source callbacks to url specific URLS to avoid ambiguity...
            // wish we could use state param to identify name/source but not all auth strategies and auth provides may provide access to that
            logger.info('Received auth code callback from Spotify', {label: 'Spotify'});
            const source = scrobbleSources.getByNameAndType(state as string, 'spotify') as SpotifySource;
            const tokenResult = await source.handleAuthCodeCallback(req.query);
            let responseContent = 'OK';
            if (tokenResult === true) {
                source.authFailure = false;
                source.poll().catch((e) => logger.error(e));
            } else {
                responseContent = tokenResult;
            }
            return res.send(responseContent);
        }
    });
}
