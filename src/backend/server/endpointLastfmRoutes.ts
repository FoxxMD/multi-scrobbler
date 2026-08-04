/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */
import type {Express} from 'express';
import { childLogger, type Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import { nonEmptyBody } from "./middleware.ts";
import { LFMEndpointNotifier } from "../sources/ingressNotifiers/LFMEndpointNotifier.ts";
import type { EndpointLastfmSource} from "../sources/EndpointLastfmSource.ts";
import { playStateFromRequest, parseDisplayIdentifiersFromRequest } from "../sources/EndpointLastfmSource.ts";
import {playToNowPlayingApiResponseJson, playToNowPlayingApiResponseXml, playToScrobbleApiResponseJson, playToScrobbleApiResponseXml, type LastFMScrobbleRequestPayload} from "../common/vendor/LastfmApiClient.ts";
import xml2js from 'xml2js';
import crypto from 'node:crypto';

const unmatchIdentifierWarn: string[] = [];

export const setupLastfmEndpointRoutes = (app: Express, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

    const logger = childLogger(parentLogger, ['Ingress', 'LFM']);

    const nonEmptyCheck = nonEmptyBody(logger, 'LFM Endpoint');

    const webhookIngress = new LFMEndpointNotifier(logger);
    app.use(/(\/api\/lastfm(?!\/callback))|(\/2.0\/?)$/,
        async function (req, res, next) {
            // track request before parsing body to ensure we at least log that something is happening
            // (in the event body parsing does not work or request is not POST/PATCH)
            webhookIngress.trackIngress(req, true);
            if (req.method !== 'POST') {
                return res.sendStatus(405);
            }
            next();
        },
        bodyParser.urlencoded({ extended: true }), 
        nonEmptyCheck, async function (req, res) {
            webhookIngress.trackIngress(req, false);

            const sources = scrobbleSources.getByType('endpointlfm') as EndpointLastfmSource[];
            if (sources.length === 0) {
                logger.warn('Received Lastfm endpoint payload but no Lastfm endpoint sources are configured');
            }

            const validSources = sources.filter(x => x.matchRequest(req));
            if (validSources.length === 0) {
                const [slug] = parseDisplayIdentifiersFromRequest(req);
                logger.warn(`No Lastfm endpoint config matched => Slug: ${slug}`);
                return res.status(409);
            }

            if(!('method' in req.body)) {
                return res.status(400).json({error: `Missing 'method' param`});
            }
            const method = (req.body as LastFMScrobbleRequestPayload).method;

            let source: EndpointLastfmSource;
            // try to find by username or api_key or sk
            if(req.body.api_key !== undefined) {
                source = validSources.find(x => x.config.data?.apiKey === req.body.api_key);
                if(source === undefined) {
                    const level = unmatchIdentifierWarn.includes(req.body.api_key) ? 'trace' : 'warn';
                    logger[level](`No LFM Endpoint Source has the apiKey '${req.body.api_key}' configured so will use the first Endpoint Source listed instead.`);
                    unmatchIdentifierWarn.push(req.body.api_key);
                }
            } else if(req.body.username !== undefined) {
                source = validSources.find(x => x.config.data?.username === req.body.username);
                if(source === undefined) {
                    const level = unmatchIdentifierWarn.includes(req.body.username) ? 'trace' : 'warn';
                    logger[level](`No LFM Endpoint Source has the username '${req.body.username}' configured so will use the first Endpoint Source listed instead.`);
                    unmatchIdentifierWarn.push(req.body.username);
                }
            } else if(req.body.sk !== undefined) {
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
                            name: req.body.name ?? source.getUid(),
                            key: crypto.createHash('md5').update(source.getUid()).digest('hex'),
                            subscriber: 0
                        }
                    };
                    if (req.query.format === 'json') {
                        return res.status(200).json(resp);
                    }
                    const builder = new xml2js.Builder();
                    const xml = builder.buildObject({ lfm: { $: { status: "ok" }, ...resp } });
                    return res.status(200).setHeader('Content-Type', 'application/xml').send(xml);
                }
                case 'track.updateNowPlaying':
                case 'track.scrobble': {
                    const playerState = playStateFromRequest(req.body);
                    if (method === 'track.scrobble') {
                        if (req.query.format === 'json') {
                            res.status(200).json(playToScrobbleApiResponseJson(playerState.play))
                        }
                        res.status(200).setHeader('Content-Type', 'application/xml').send(playToScrobbleApiResponseXml(playerState.play));
                    } else {
                        if (req.query.format === 'json') {
                            res.status(200).json(playToNowPlayingApiResponseJson(playerState.play))
                        }
                        res.status(200).setHeader('Content-Type', 'application/xml').send(playToNowPlayingApiResponseXml(playerState.play));
                    }
                    await source.handle(playerState)
                } break;
                default:
                    return res.status(400).json({ error: `Unexpected 'method' param value '${method}', expected one of: track.updateNowPlaying | track.scrobble | auth.getMobileSession` });

            }
        });
}