import type {Express} from 'express';
import type {Logger} from "@foxxmd/logging";
import type LastfmScrobbler from "../scrobblers/LastfmScrobbler.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import type LastfmSource from "../sources/LastfmSource.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type SpotifySource from "../sources/SpotifySource.ts";
import type YTMusicSource from "../sources/YTMusicSource.ts";
import type LibrefmScrobbler from "../scrobblers/LibrefmScrobbler.ts";
import type LibrefmSource from "../sources/LibrefmSource.ts";
import AbstractSource from "../sources/AbstractSource.ts";
import { makeComponentMiddle } from './middleware.ts';
import { findAuthIssue, SimpleError } from '../common/errors/MSErrors.ts';
import type { createTypedRouter } from '@minisylar/express-typed-router';

export const setupAuthRoutes = (app: Express, router: ReturnType<typeof createTypedRouter>, logger: Logger, scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {
    const componentAwareMiddle = makeComponentMiddle(scrobbleSources, scrobbleClients);

    router.get('/api/components/:componentVal/auth', {middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Source/Client Auth URL'}, async (req, res, next) => {
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

    app.get(/.*callback$/, async (req, res) => {
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
                entity.clearErrors({predicate: x => findAuthIssue(x) !== undefined});
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
            res.redirect('/next');
            return;
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
            res.send(responseContent);
            return;
        } else {
            // TODO right now all sources requiring source interaction are covered by logic branches (deezer above and spotify here)
            // but eventually should update all source callbacks to url specific URLS to avoid ambiguity...
            // wish we could use state param to identify name/source but not all auth strategies and auth provides may provide access to that
            logger.info({label: 'Spotify'}, 'Received auth code callback from Spotify');
            const source = scrobbleSources.getByNameAndType(state as string, 'spotify', true) as SpotifySource;
            try {
                const tokenResult = await source.handleAuthCodeCallback(req.query);
                if (tokenResult === true) {
                    source.clearErrors({predicate: x => findAuthIssue(x) !== undefined});
                    source.poll().catch((e) => logger.error(e));
                } else {
                    if (tokenResult instanceof Error) {
                        source.replaceErrors(tokenResult, {predicate: (x) => x.message === tokenResult.message});
                        source.logger.error(tokenResult);
                    } else if (typeof tokenResult === 'string') {
                        const e = new SimpleError(`Token result was unexpected: ${tokenResult}`);
                        source.replaceErrors(e, {predicate: (x) => x.message === e.message});
                        source.logger.error(e);
                    }
                }
            } catch (e) {
                const err = new SimpleError('Unexpected error while trying to authorize code, or save file', { cause: e });
                source.replaceErrors(err, {predicate: (x) => err.message === x.message});
                source.logger.error(err);
            }
            res.redirect('/next');
            return;
        }
    });
}
