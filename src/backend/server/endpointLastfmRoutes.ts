/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */
import type {Express, Request, Response} from 'express';
import { childLogger, type Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import { nonEmptyBody } from "./middleware.ts";
import { LFMEndpointNotifier } from "../sources/ingressNotifiers/LFMEndpointNotifier.ts";
import type { EndpointLastfmSource} from "../sources/EndpointLastfmSource.ts";
import { playStateFromRequest, requestMatchers } from "../sources/EndpointLastfmSource.ts";
import {lastfmAuthRequestPayloadSchema, lastfmScrobbleRequestSchema, playToNowPlayingApiResponseJson, playToNowPlayingApiResponseXml, playToScrobbleApiResponseJson, playToScrobbleApiResponseXml, type LastFMPayloadkey, type LastFMScrobbleRequestPayload} from "../common/vendor/LastfmApiClient.ts";
import xml2js from 'xml2js';
import crypto from 'node:crypto';
import type { createTypedRouter, SchemaRequest, TypedMiddleware } from "@minisylar/express-typed-router";
import { parseDisplayIdentifiersFromRequest } from '../utils/RequestUtils.ts';
import * as z from 'zod';

const unmatchIdentifierWarn: string[] = [];

const looseFmBody = z.xor([lastfmScrobbleRequestSchema, lastfmAuthRequestPayloadSchema]);
type LooseFmBody = typeof looseFmBody;
const looseQuery = z.looseObject({format: z.string().optional()});
type LooseQuery = typeof looseQuery;

export const setupLastfmEndpointRoutes = (app: Express, router: ReturnType<typeof createTypedRouter>, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

    const logger = childLogger(parentLogger, ['Ingress', 'LFM']);

    const nonEmptyCheck = nonEmptyBody(logger, 'LFM Endpoint');

    const webhookIngress = new LFMEndpointNotifier(logger);

    const rawIngress: TypedMiddleware = (req, res, next) => {
        webhookIngress.trackIngress(req, true);
        if (req.method !== 'POST') {
            res.sendStatus(405);
            return;
        }
        next();
    };

    const submitRoute = async (req: SchemaRequest<"/api/lastfm/*path"|'/2.0/', LooseFmBody, LooseQuery>, res: Response) => {
            webhookIngress.trackIngress(req as Request, false);

            const sources = scrobbleSources.getByType('endpointlfm') as EndpointLastfmSource[];
            if (sources.length === 0) {
                logger.warn('Received Lastfm endpoint payload but no Lastfm endpoint sources are configured');
            }

            const validSources = sources.filter(x => x.matchRequest(req));
            if (validSources.length === 0) {
                const [slug] = parseDisplayIdentifiersFromRequest(req, requestMatchers);
                logger.warn(`No Lastfm endpoint config matched => Slug: ${slug}`);
                res.sendStatus(409);
                return;
            }

            if(!('method' in req.body)) {
                return res.status(400).json({error: `Missing 'method' param`});
            }
            const method = req.body.method; // (req.body as unknown as LastFMScrobbleRequestPayload).method;

            let wantsJson: boolean = false;
            if(req.query.format === 'json') {
                wantsJson = true;
            } else {
                // some players, like ArchiveTune, use the accept header to signal they want json
                // rather than using the official format=json qs lastfm wants
                const a = req.header('accept');
                if(a !== undefined && a.includes('json')) {
                    wantsJson = true;
                }
            }

            let source: EndpointLastfmSource;
            // try to find by username or api_key or sk
            if(req.body.api_key !== undefined) {
                source = validSources.find(x => x.config.data?.apiKey === req.body.api_key);
                if(source === undefined) {
                    const level = unmatchIdentifierWarn.includes(req.body.api_key) ? 'trace' : 'warn';
                    logger[level](`No LFM Endpoint Source has the apiKey '${req.body.api_key}' configured so will use the first Endpoint Source listed instead.`);
                    unmatchIdentifierWarn.push(req.body.api_key);
                }
            } else if(`username` in req.body && req.body.username !== undefined) {
                // @ts-expect-error need TS to narrow this more intelligently
                source = validSources.find(x => x.config.data?.username === req.body.username);
                if(source === undefined) {
                    const level = unmatchIdentifierWarn.includes(req.body.username) ? 'trace' : 'warn';
                    logger[level](`No LFM Endpoint Source has the username '${req.body.username}' configured so will use the first Endpoint Source listed instead.`);
                    unmatchIdentifierWarn.push(req.body.username);
                }
            } else if(`sk` in req.body && req.body.sk !== undefined) {
                // @ts-expect-error need TS to narrow this more intelligently
                source = validSources.find(x => crypto.createHash('md5').update(x.getUid()).digest('hex') === req.body.sk);
                if(source === undefined) {
                    const level = unmatchIdentifierWarn.includes(req.body.sk) ? 'trace' : 'warn';
                    logger[level](`No LFM Endpoint Source has an ID md5 that matches the provided session key (sk) '${req.body.sk}' configured so will use the first Endpoint Source listed instead.`);
                    unmatchIdentifierWarn.push(req.body.sk);
                }
            }

            if(source === undefined) {
                source = validSources[0];
            }

            switch (method) {
                case 'auth.getMobileSession': {
                    const resp = {
                        session: {
                            // @ts-expect-error idk sometimes they send this
                            name: req.body.name ?? source.getUid(),
                            key: crypto.createHash('md5').update(source.getUid()).digest('hex'),
                            subscriber: 0
                        }
                    };
                    source.logger.info(`Authenticating with username ${resp.session.name}`);
                    if (wantsJson) {
                        return res.status(200).json(resp);
                    }
                    const builder = new xml2js.Builder();
                    const xml = builder.buildObject({ lfm: { $: { status: "ok" }, ...resp } });
                    return res.status(200).setHeader('Content-Type', 'application/xml').send(xml);
                }
                case 'track.updateNowPlaying':
                case 'track.scrobble': {
                    // @ts-expect-error need TS to narrow this more intelligently
                    const playerState = playStateFromRequest(req.body);
                    if (method === 'track.scrobble') {
                        if (wantsJson) {
                            res.status(200).json(playToScrobbleApiResponseJson(playerState[0].play))
                        } else {
                            res.status(200).setHeader('Content-Type', 'application/xml').send(playToScrobbleApiResponseXml(playerState[0].play));
                        }
                    } else {
                        if (wantsJson) {
                            res.status(200).json(playToNowPlayingApiResponseJson(playerState[0].play))
                        } else {
                            res.status(200).setHeader('Content-Type', 'application/xml').send(playToNowPlayingApiResponseXml(playerState[0].play));
                        }
                    }
                    await source.handle(playerState)
                } break;
                default:
                    return res.status(400).json({ error: `Unexpected 'method' param value '${method}', expected one of: track.updateNowPlaying | track.scrobble | auth.getMobileSession` });

            }
    }

    router.post('/api/lastfm/*path', {
        middleware: [rawIngress,bodyParser.urlencoded({ extended: true }),nonEmptyCheck],
        bodySchema: z.union([lastfmScrobbleRequestSchema, lastfmAuthRequestPayloadSchema]),
        querySchema: z.looseObject({format: z.string().optional()}),
        tags: ['Lastfm Ingress'],
        summary: 'Accept a Last.fm Scrobble (Slug)',
        description: 'Accepts the standard Last.fm `track.scrobble` payload at this endpoint.'
    }, submitRoute);

    router.post('/2.0/', {
        middleware: [rawIngress,bodyParser.urlencoded({ extended: true }),nonEmptyCheck],
        bodySchema: z.union([lastfmScrobbleRequestSchema, lastfmAuthRequestPayloadSchema]),
        querySchema: z.looseObject({format: z.string().optional()}),
        tags: ['Lastfm Ingress'],
        summary: 'Accept a Last.fm Scrobble (Standard)',
        description: 'Accepts the standard Last.fm `track.scrobble` payload at this endpoint.'
    }, async function (req, res) {});

    app.use(/(\/api\/lastfm(?!\/callback))|(\/2.0\/?)$/,
        async function (req, res) {
            logger.warn(`Received what looks like a Last.fm Endpoint request but it was to an invalid URL route: ${req.originalUrl}\nMake sure base URL path to MS endpoint is correct.`);
            res.sendStatus(404);
        });
}