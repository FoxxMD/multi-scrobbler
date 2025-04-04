/* eslint-disable prefer-arrow-functions/prefer-arrow-functions */
import { ExpressWithAsync } from "@awaitjs/express";
import { childLogger, Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import ScrobbleSources from "../sources/ScrobbleSources.ts";
import { nonEmptyBody } from "./middleware.ts";
import { LFMEndpointNotifier } from "../sources/ingressNotifiers/LFMEndpointNotifier.ts";
import { EndpointLastfmSource, playStateFromRequest, parseDisplayIdentifiersFromRequest } from "../sources/EndpointLastfmSource.ts";
import { LastfmTrackUpdateRequest } from "lastfm-node-client";

export const setupLastfmEndpointRoutes = (app: ExpressWithAsync, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

    const logger = childLogger(parentLogger, ['Ingress', 'LFM']);

    const nonEmptyCheck = nonEmptyBody(logger, 'LFM Endpoint');

    const webhookIngress = new LFMEndpointNotifier(logger);
    app.useAsync(/(\/api\/lastfm(?!\/callback))|(\/2.0\/?)$/,
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
            }

            if(!('method' in req.body)) {
                return res.status(400).json({error: `Missing 'method' param`});
            }
            const method = (req.body as LastfmTrackUpdateRequest).method;
            if(!['track.updateNowPlaying','track.scrobble'].includes(method)) {
                return res.status(400).json({error: `Unexpected 'method' param value '${method}', expected either 'track.updateNowPlaying' or 'track.scrobble'`});
            }

            res.sendStatus(200);

            const playerState = playStateFromRequest(req.body);

            for (const source of validSources) {
                await source.handle(playerState);
            }
        });
}

