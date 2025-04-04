/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */
import { ExpressWithAsync } from "@awaitjs/express";
import { childLogger, Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import { EndpointListenbrainzSource, playStateFromRequest, parseDisplayIdentifiersFromRequest } from "../sources/EndpointListenbrainzSource.ts";
import { LZEndpointNotifier } from "../sources/ingressNotifiers/LZEndpointNotifier.ts";
import ScrobbleSources from "../sources/ScrobbleSources.ts";
import { nonEmptyBody } from "./middleware.ts";

export const setupLZEndpointRoutes = (app: ExpressWithAsync, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

    const logger = childLogger(parentLogger, ['Ingress', 'Listenbrainz']);

    const lzJsonParser = bodyParser.json({
        type: ['text/*', 'application/json'],
    });
    const nonEmptyCheck = nonEmptyBody(logger, 'LZ Endpoint');

    const webhookIngress = new LZEndpointNotifier(logger);
    app.useAsync(/(\/api\/listenbrainz.*)|(\/1\/submit-listens)/,
        async function (req, res, next) {
            // track request before parsing body to ensure we at least log that something is happening
            // (in the event body parsing does not work or request is not POST/PATCH)
            webhookIngress.trackIngress(req, true);
            if (req.method !== 'POST') {
                return res.sendStatus(405);
            }
            next();
        },
        lzJsonParser, nonEmptyCheck, async function (req, res) {
            webhookIngress.trackIngress(req, false);

            res.sendStatus(200);


            const sources = scrobbleSources.getByType('endpointlz') as EndpointListenbrainzSource[];
            if (sources.length === 0) {
                logger.warn('Received Listenbrainz endpoint payload but no Listenbrainz endpoint sources are configured');
            }

            const validSources = sources.filter(x => x.matchRequest(req));
            if (validSources.length === 0) {
                const [slug, token] = parseDisplayIdentifiersFromRequest(req);
                logger.warn(`No Listenbrainz endpoint config matched => Slug: ${slug} | Token: ${token}`);
            }

            const playerState = playStateFromRequest(req.body);

            for (const source of validSources) {
                await source.handle(playerState);
            }
        });
    app.getAsync('/1/validate-token', async function (req, res) {
        //https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-validate-token
        return res.status(200).json({
            code: 200,
            message: "Token valid.",
            valid: true,
            user_name: "Multi-Scrobbler"
        })
    });
}

