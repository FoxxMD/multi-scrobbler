import type {Express} from 'express';
import type {Logger} from "@foxxmd/logging";
import type LastfmScrobbler from "../scrobblers/LastfmScrobbler.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import type LastfmSource from "../sources/LastfmSource.ts";
import type MixcloudSource from "../sources/MixcloudSource.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type SpotifySource from "../sources/SpotifySource.ts";
import type YTMusicSource from "../sources/YTMusicSource.ts";
import type LibrefmScrobbler from "../scrobblers/LibrefmScrobbler.ts";
import type LibrefmSource from "../sources/LibrefmSource.ts";
import AbstractSource from "../sources/AbstractSource.ts";
import { CLIENT_IP_HEADER, makeComponentMiddle, secretMatches } from './middleware.ts';
import type AbstractComponent from '../common/AbstractComponent.ts';
import { findAuthIssue, SimpleError } from '../common/errors/MSErrors.ts';
import type { createTypedRouter } from '@minisylar/express-typed-router';
import * as z from 'zod';

export const setupAuthRoutes = (app: Express, router: ReturnType<typeof createTypedRouter>, logger: Logger, scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {
    const componentAwareMiddle = makeComponentMiddle(scrobbleSources, scrobbleClients);

    router.get('/components/:id/auth', {docs: {operationId: 'get-source-client-auth-url'}, middleware: [componentAwareMiddle], tags: ['Source/Client'], summary: 'Get Source/Client Auth URL'}, async (req, res, next) => {
        switch(req.component.type) {
            case 'lastfm':
            case 'librefm':
                res.status(200).send((req.component as LastfmScrobbler | LastfmSource | LibrefmScrobbler | LibrefmSource ).api.getAuthUrl(req.component.oauthState));
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
            case 'mixcloud': {
                const source = req.component as MixcloudSource;
                if (source.redirectUri === undefined) {
                    res.status(400).send('Mixcloud configuration is not valid');
                } else {
                    logger.info('Redirecting to mixcloud authorization url');
                    res.status(200).send(source.createAuthUrl());
                }
            } break;
        }
    });

    app.get(/.*callback$/, async (req, res) => {
        if(req.url.indexOf('/api') !== 0) {
            return res.redirect(307, `/api${req.url}`);
        }
        return res.sendStatus(404);
    });

    // third-party auth callbacks are browser redirects (the flow is started from the dashboard), so the user's session is present
    router.get(/.*callback$/, {
        docs: {operationId: 'get-resource'},
        querySchema: z.looseObject({}).optional(),
        paramsSchema: z.looseObject({}).optional(),
    }, async (req, res) => {
        const {
            query: {
                state,
            } = {}
        } = req;
        const entityTypeHint = req.url.includes('lastfm') ? 'lastfm' : 'librefm';

        // the callback must carry the state of an auth flow started from this instance (see AbstractComponent.oauthState),
        // otherwise a link with someone else's authorization code could connect a component to *their* account
        const findByState = <T extends AbstractComponent>(candidates: AbstractComponent[]): T | undefined =>
            typeof state === 'string' ? candidates.find(x => secretMatches(x.oauthState, state)) as T | undefined : undefined;
        const rejectState = (provider: string) => {
            logger.warn(`Rejected ${provider} auth callback from ${req.headers[CLIENT_IP_HEADER] ?? 'unknown'}: it does not match an authentication started from this instance`);
            res.status(400).type('text').send('This authorization link is invalid, expired or was already used. Start authentication again from the multi-scrobbler dashboard.');
        }

        if (req.url.includes('lastfm') || req.url.includes('librefm')) {
            const {
                query: {
                    token
                } = {}
            } = req;
            const entity = findByState<LastfmScrobbler | LastfmSource | LibrefmScrobbler | LibrefmSource>([...scrobbleClients.getByType(entityTypeHint), ...scrobbleSources.getByType(entityTypeHint)]);
            if(entity === undefined) {
                rejectState(entityTypeHint);
                return;
            }
            try {
                await entity.api.authenticate(token);
                entity.rotateOAuthState();
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
                    entity.errors.push(e as Error);
                    entity.logger.error(e);
                } else {
                    logger.error(e);
                }
            }
            res.redirect('/');
            return;
        } else if(req.url.includes('ytmusic')) {
            const entity = findByState<YTMusicSource>(scrobbleSources.getByType('ytmusic'));
            if(entity === undefined) {
                rejectState('YTMusic');
                return;
            }
            const result = await entity.handleAuthCodeCallback(req.query as Record<string, any>);
            let responseContent = 'OK';
            if(result === true) {
                entity.rotateOAuthState();
                entity.authFailure = false;
                entity.poll().catch((e) => logger.error(e));
            } else {
                responseContent = result;
            }
            res.send(responseContent);
            return;
        } else if(req.url.includes('mixcloud')) {
            logger.info({label: 'Mixcloud'}, 'Received auth code callback from Mixcloud');
            const source = findByState<MixcloudSource>(scrobbleSources.getByType('mixcloud'));
            if(source === undefined) {
                rejectState('Mixcloud');
                return;
            }
            try {
                const tokenResult = await source.handleAuthCodeCallback(req.query);
                if (tokenResult === true) {
                    // after the token exchange, which needs the redirect uri (with the current state) used to authorize
                    source.rotateOAuthState();
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
            res.redirect('/');
            return;
        } else {
            // TODO right now all sources requiring source interaction are covered by logic branches (spotify here)
            // but eventually should update all source callbacks to url specific URLS to avoid ambiguity...
            logger.info({label: 'Spotify'}, 'Received auth code callback from Spotify');
            const source = findByState<SpotifySource>(scrobbleSources.getByType('spotify'));
            if(source === undefined) {
                rejectState('Spotify');
                return;
            }
            try {
                const tokenResult = await source.handleAuthCodeCallback(req.query);
                if (tokenResult === true) {
                    source.rotateOAuthState();
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
            res.redirect('/');
            return;
        }
    });
}
