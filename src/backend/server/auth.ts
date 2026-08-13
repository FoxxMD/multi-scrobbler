import type {Express} from 'express';
import type {Logger} from "@foxxmd/logging";
import passport from "passport";
import type {ExpressHandler} from "../common/infrastructure/Atomic.ts";
import type LastfmScrobbler from "../scrobblers/LastfmScrobbler.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import type LastfmSource from "../sources/LastfmSource.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type SpotifySource from "../sources/SpotifySource.ts";
import type YTMusicSource from "../sources/YTMusicSource.ts";
import type LibrefmScrobbler from "../scrobblers/LibrefmScrobbler.ts";
import type LibrefmSource from "../sources/LibrefmSource.ts";
import AbstractSource from "../sources/AbstractSource.ts";
import { makeComponentMiddle, type ComponentAwareRequest } from './middleware.ts';
import { findAuthIssue, SimpleError } from '../common/errors/MSErrors.ts';

export const setupAuthRoutes = (app: Express, logger: Logger, sourceMiddle: ExpressHandler, clientMiddle: ExpressHandler, scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {
    const componentAwareMiddle = makeComponentMiddle(scrobbleSources, scrobbleClients);

    app.get('/api/components/:componentVal/auth', componentAwareMiddle, async (req: ComponentAwareRequest, res, next) => {
        switch(req.component.type) {
            case 'lastfm':
            case 'librefm':
                res.status(200).send((req.component as LastfmScrobbler | LastfmSource | LibrefmScrobbler | LibrefmSource ).api.getAuthUrl());
                break;
            case 'spotify': {
                const source = req.component as SpotifySource;
                if (source.spotifyApi === undefined) {
                    res.status(400).send('Spotify configuration is not valid');
                } else {
                    logger.info('Redirecting to spotify authorization url');
                    res.status(200).send(source.createAuthUrl());
                }
            } break;
        }
    });

    app.use('/api/client/auth', clientMiddle);
    app.get('/api/client/auth', async (req, res) => {
        const {
            scrobbleClient,
        } = req as any;

        switch (scrobbleClient.type) {
            case 'lastfm':
            case 'librefm':
                res.redirect(scrobbleClient.api.getAuthUrl());
                break;
            case 'tealfm':
                const url = await scrobbleClient.getAuthorizeUrl();
                res.redirect(url);
                break;
            default:
                return res.status(400).send(`Specified client does not have auth implemented (${scrobbleClient.type})`);
        }
    });

    app.use('/api/source/auth', sourceMiddle);
    app.get('/api/source/auth', async (req, res, next) => {
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
            case 'librefm':
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

    app.get(/.*callback$/, async (req, res, next) => {
        if(req.url.indexOf('/api') !== 0) {
            return res.redirect(307, `/api${req.url}`);
        }
        const {
            query: {
                state,
                name
            } = {}
        } = req;
        const entityTypeHint = req.url.includes('lastfm') ? 'lastfm' : 'librefm';

        if (req.url.includes('lastfm') || req.url.includes('librefm')) {
            const {
                query: {
                    token
                } = {}
            } = req;
            let entity: LastfmScrobbler | LastfmSource | LibrefmScrobbler | LibrefmSource | undefined;
            if(req.url.includes('lastfm')) {
                entity = scrobbleClients.getByNameAndType(state as string, 'lastfm', true) as (LastfmScrobbler | LastfmSource | undefined);
            } else {
                entity = scrobbleClients.getByNameAndType(state as string, 'librefm', true) as (LibrefmScrobbler | LibrefmSource | undefined);
            }

            if(entity === undefined) {
                entity = scrobbleSources.getByName(state, true) as LastfmSource | LibrefmSource;
            }
            try {
                if(entity === undefined) {
                    const error = new Error(`No source/client with type '${entityTypeHint}' and name ${state} was found`);
                    logger.error(error);
                    throw error;
                }
                await entity.api.authenticate(token);
                entity.errors = entity.errors.filter(x => !findAuthIssue(x));
                if(entity instanceof AbstractSource) {
                    entity.poll().catch((e) => logger.error(e));
                } else {
                    entity.initialize()
                    .catch((e) => logger.error(e))
                    .then(() => {
                        entity.initScrobbleMonitoring().catch((e) => logger.error(e));
                    })
                }
            } catch (e) {
                if(entity !== undefined) {
                    entity.errors.push(e);
                    entity.logger.error(e);
                } else {
                    logger.error(e);
                }
            }
            return res.redirect('/next');
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
            logger.info({label: 'Spotify'}, 'Received auth code callback from Spotify');
            const source = scrobbleSources.getByNameAndType(state as string, 'spotify', true) as SpotifySource;
            try {
                const tokenResult = await source.handleAuthCodeCallback(req.query);
                if (tokenResult === true) {
                    source.errors = source.errors.filter(x => !findAuthIssue(x));
                    source.poll().catch((e) => logger.error(e));

                } else {
                    if (tokenResult instanceof Error) {
                        source.errors.push(tokenResult);
                        source.logger.error(tokenResult);
                    } else if (typeof tokenResult === 'string') {
                        const e = new SimpleError(`Token result was unexpected: ${tokenResult}`);
                        source.errors.push(e);
                        source.logger.error(e);
                    }
                }
            } catch (e) {
                const err = new SimpleError('Unexpected error while trying to authorize code, or save file', { cause: e });
                source.errors.push(err);
                source.logger.error(err);
            }
            return res.redirect('/next');
        }
    });
}
