import {mergeArr, parseBool, remoteHostIdentifiers} from "../utils";
import {ExpressWithAsync} from "@awaitjs/express";
import {Logger} from "@foxxmd/winston";
import ScrobbleSources from "../sources/ScrobbleSources";
import bodyParser from "body-parser";
import {nonEmptyBody} from "./middleware";
import {LZEndpointNotifier} from "../sources/ingressNotifiers/LZEndpointNotifier";
import {EndpointListenbrainzSource} from "../sources/EndpointListenbrainzSource";

export const setupLZEndpointRoutes = (app: ExpressWithAsync, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

    const logger = parentLogger.child({labels: ['Ingress', 'Listenbrainz']}, mergeArr);

    const lzJsonParser = bodyParser.json({
        type: ['text/*', 'application/json'],
    });
    const nonEmptyCheck = nonEmptyBody(logger, 'LZ Endpoint', false);

    const webhookIngress = new LZEndpointNotifier();
    app.useAsync(/\/api\/listenbrainz.*/,
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
                const [slug, token] = EndpointListenbrainzSource.parseDisplayIdentifiersFromRequest(req);
                logger.warn(`No Listenbrainz endpoint config matched => Slug: ${slug} | Token: ${token}`);
            }

            const playerState = EndpointListenbrainzSource.playStateFromRequest(req.body);

            for (const source of validSources) {
                await source.handle(playerState);
            }
        });
}

