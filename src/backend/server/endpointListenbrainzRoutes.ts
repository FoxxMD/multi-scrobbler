/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */
import type {Express} from 'express';
import { childLogger, type Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import type { EndpointListenbrainzSource} from "../sources/EndpointListenbrainzSource.ts";
import { playStateFromRequest, parseDisplayIdentifiersFromRequest } from "../sources/EndpointListenbrainzSource.ts";
import { LZEndpointNotifier } from "../sources/ingressNotifiers/LZEndpointNotifier.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import { nonEmptyBody } from "./middleware.ts";
import type {PlayingNowPayload} from '../../core/vendor/listenbrainz/interfaces.ts';
import type ScrobbleClients from '../scrobblers/ScrobbleClients.ts';
import { playToListenPayload } from '../common/vendor/listenbrainz/lzUtils.ts';
import { stringToDeterministicNumber } from '../utils/StringUtils.ts';
import { messageWithCauses } from '../../core/ErrorUtils.ts';

const TEXT_WILDCARD_REGEX = new RegExp(/text\/.+/);

export const setupLZEndpointRoutes = (app: Express, parentLogger: Logger, scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {

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
    app.use(/(\/api\/listenbrainz.*)|(\/1\/submit-listens\/?$)/,
        async function (req, res, next) {
            // track request before parsing body to ensure we at least log that something is happening
            // (in the event body parsing does not work or request is not POST/PATCH)
            webhookIngress.trackIngress(req, true);
            if (req.method !== 'POST') {
                logger.warn(`Expected request to this endpoint to be POST but got ${req.method} instead. URL: ${req.originalUrl}\nMake sure base URL path to MS endpoint is correct.`);
                return res.sendStatus(405);
            }
            next();
        },
        lzJsonParser, nonEmptyCheck, async function (req, res) {
            webhookIngress.trackIngress(req, false);

            logger.trace({body: req.body}, "Recieved request Body");

            const playerStates = playStateFromRequest(req.body);

            const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
            if (sources.length === 0) {
                logger.warn('Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured');
                return res.status(409).json({error: `Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured`, code: 409});
            }

            const validSources = sources.filter(x => x.matchRequest(req));
            if (validSources.length === 0) {
                const [slug, token] = parseDisplayIdentifiersFromRequest(req);
                logger.warn(`No Listenbrainz endpoint config matched => Slug: ${slug} | Token: ${token}`);
                return res.status(409).json({error: `No Listenbrainz endpoint config matched => Slug: ${slug} | Token: ${token}`, code: 409});
            }

            try {
                for (const source of validSources) {
                    await source.handle(playerStates);
                }
            } catch (e) {
                const submitListenError = new Error('Unexpected error occurred while processing submit-listens request', {cause: e});
                const errMsg = messageWithCauses(submitListenError);
                logger.error(submitListenError);
                return res.status(500).json({error: errMsg, code: 500});
            }

            return res.status(200).json({status: "ok"});
        });

    app.get('/1/user/:username/playing-now', async function (req, res) {
        // TODO need to implement user names for endpoint configs
        // so we can identify playing now calls by user
        // and then determine actual playing now by clients that are able to be scrobbled to from this source
        //
        // but for now just stub out empty response so panoscrobbler doesn't complain

        const user = req.params.username;
        let listens: PlayingNowPayload[];

        const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
        if (sources.length === 0) {
            logger.warn('Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured');
        }

        const matchedSource = sources.find(x => x.config.data?.username === user || x.name === user);

        const playObjs = scrobbleClients.getPlayingNow(matchedSource.name, matchedSource.clients);
        listens = playObjs.map(x => ({playing_now: true, track_metadata: playToListenPayload(x).track_metadata}));

        return res.status(200).json({
            payload: {
                listens,
                playing_now: true,
                user_id: stringToDeterministicNumber(user),
                count: listens.length
            }
        });
    });  

    app.get('/1/validate-token', async function (req, res) {
        //https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-validate-token

        const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
        if (sources.length === 0) {
            logger.warn('Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured');
        }
        const validSources = sources.filter(x => x.matchRequest(req));
        if (validSources.length === 0) {
            const [slug, token] = parseDisplayIdentifiersFromRequest(req);
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

