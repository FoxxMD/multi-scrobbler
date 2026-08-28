/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */
import type {Express, Request} from 'express';
import { childLogger, type Logger } from "@foxxmd/logging";
import type {Writable} from 'ts-essentials';
import bodyParser from "body-parser";
import type { EndpointListenbrainzSource} from "../sources/EndpointListenbrainzSource.ts";
import { playStateFromRequest, requestMatchers } from "../sources/EndpointListenbrainzSource.ts";
import { LZEndpointNotifier } from "../sources/ingressNotifiers/LZEndpointNotifier.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import { nonEmptyBody } from "./middleware.ts";
import {submitPayloadSchema, type PlayingNowPayload, type SubmitPayload} from '../../core/vendor/listenbrainz/interfaces.ts';
import type ScrobbleClients from '../scrobblers/ScrobbleClients.ts';
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.ts';
import { stringToDeterministicNumber } from '../utils/StringUtils.ts';
import { messageWithCauses } from '../../core/ErrorUtils.ts';
import type { createTypedRouter, TypedMiddleware, InferSchemaHandler } from "@minisylar/express-typed-router";
import { stripIndents } from 'common-tags';
import { parseDisplayIdentifiersFromRequest } from '../utils/RequestUtils.ts';

const TEXT_WILDCARD_REGEX = new RegExp(/text\/.+/);

export const setupLZEndpointRoutes = (app: Express, router: ReturnType<typeof createTypedRouter>, parentLogger: Logger, scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {

    const logger = childLogger(parentLogger, ['Ingress', 'Listenbrainz']);

    const lzJsonParser = bodyParser.json({
        type: (req) => {
            // either Music Assistant, or the library it uses (libmusicbrainz),
            // does not send a content-type header so we need to YOLO these requests
            if(req.headers["content-type"] === undefined) {
                return true;
            }
            if(TEXT_WILDCARD_REGEX.test(req.headers["content-type"]) || req.headers["content-type"].includes('application/json')) {
                return true;
            }
            return false;
        },
    });
    const nonEmptyCheck = nonEmptyBody(logger, 'LZ Endpoint');

    const webhookIngress = new LZEndpointNotifier(logger);

    const rawIngress: TypedMiddleware = (req, res, next) => {
        webhookIngress.trackIngress(req, true);
        next();
    };

    const middleware = [rawIngress,lzJsonParser,nonEmptyCheck] as const;

    type SubmitHandler = InferSchemaHandler<{
        bodySchema: typeof submitPayloadSchema,
        middleware: typeof middleware,
    }>;

    const submitRoute: SubmitHandler = async (req, res) => {
        webhookIngress.trackIngress(req as Request, false);

        logger.trace({body: req.body}, "Recieved request Body");

        //req.body.payload[0].track_metadata.additional_info.recording_mbid
        const playerStates = playStateFromRequest(req.body as unknown as SubmitPayload);

        const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
        if (sources.length === 0) {
            logger.warn('Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured');
            res.status(409).json({error: `Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured`, code: 409});
            return;
        }

        const validSources = sources.filter(x => x.matchRequest(req));
        if (validSources.length === 0) {
            const [slug, token] = parseDisplayIdentifiersFromRequest(req, requestMatchers);
            logger.warn(`No Listenbrainz endpoint config matched => Slug: ${slug} | Token: ${token}`);
            res.status(409).json({error: `No Listenbrainz endpoint config matched => Slug: ${slug} | Token: ${token}`, code: 409});
            return;
        }

        try {
            for (const source of validSources) {
                await source.handle(playerStates);
            }
        } catch (e) {
            const submitListenError = new Error('Unexpected error occurred while processing submit-listens request', {cause: e});
            const errMsg = messageWithCauses(submitListenError);
            logger.error(submitListenError);
            res.status(500).json({error: errMsg, code: 500});
            return;
        }

        res.status(200).json({status: "ok"});
    }

    router.post('/api/listenbrainz{*splat}', {
        bodySchema: submitPayloadSchema,
        middleware: middleware as Writable<typeof middleware>,
        tags: ['Listenbrainz Ingress'],
        summary: 'Accept a Listenbrainz Scrobble (Slug)',
        description: 'Accepts the standard Listenbrainz `submit-listens` payload at this endpoint.',
    }, submitRoute);
    router.post('/1/submit-listens', {
        middleware: middleware as Writable<typeof middleware>,
        bodySchema: submitPayloadSchema,
        tags: ['Listenbrainz Ingress'],
        summary: 'Accept a Listenbrainz Scrobble (Standard)',
        description: 'Accepts the standard Listenbrainz `submit-listens` payload at this endpoint.'
    }, submitRoute);

    router.get('/1/user/:username/playing-now',{
        tags: ['Listenbrainz Ingress'],
        summary: 'Get Playing Now',
        description: stripIndents`Tries to match username with the username set in the config of an LZ Endpoint Source.
        
        If no match then returns Playing Now for the first LZ Endpoint configured.`
    }, async function (req, res) {
        // TODO need to implement user names for endpoint configs
        // so we can identify playing now calls by user
        // and then determine actual playing now by clients that are able to be scrobbled to from this source
        //
        // but for now just stub out empty response so panoscrobbler doesn't complain

        const user = req.params.username;

        const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
        if (sources.length === 0) {
            return res.status(409).json({error: `Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured`, code: 409});
        }

        let matchedSource = sources.find(x => x.config.data?.username === user || x.name === user);
        if(matchedSource === undefined) {
            matchedSource = sources[0];
        }

        const playObjs = scrobbleClients.getPlayingNow(matchedSource.name, matchedSource.clients);
        const listens: PlayingNowPayload[] = playObjs.map(x => ({playing_now: true, track_metadata: playToListenPayload(x).track_metadata}));

        return res.status(200).json({
            payload: {
                listens,
                playing_now: true,
                user_id: stringToDeterministicNumber(user),
                count: listens.length
            }
        });
    });  

    router.get('/1/validate-token', {
        tags: ['Listenbrainz Ingress'],
        summary: 'Validate Token',
        description: stripIndents`Always returns valid as long as any endpointlz source is configured.
        
        For \`username\` in the response it will return the Source \`config.data.username\` or fallback to the Source's \`name\` or fallback to \`Multi-Scrobbler\` if no valid Sources.`
    }, async function (req, res) {
        //https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-validate-token

        const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
        if (sources.length === 0) {
            logger.warn('Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured');
            res.sendStatus(404);
            return;
        }
        const validSources = sources.filter(x => x.matchRequest(req));
        if (validSources.length === 0) {
            const [slug, token] = parseDisplayIdentifiersFromRequest(req, requestMatchers);
            logger.warn(`No Listenbrainz endpoint config matched => Token: ${token}`);
        }

        let username = "Multi-Scrobbler";
        if(validSources.length > 0) {
            username = validSources[0].config.data.username ?? validSources[0].name;
        }

        logger.info('Validated token');
        return res.status(200).json({
            code: 200,
            message: "Token valid.",
            valid: true,
            user_name: username
        })
    });
    app.use(/\/1\/.*/, async function (req, res) {
        logger.warn(`Received what looks like a Listenbrainz Endpoint request but it was to an invalid URL route: ${req.originalUrl}\nMake sure base URL path to MS endpoint is correct.`);
        res.sendStatus(404);
    });
}

