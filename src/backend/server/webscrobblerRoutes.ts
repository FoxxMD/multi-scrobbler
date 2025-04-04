import { ExpressWithAsync } from "@awaitjs/express";
import { childLogger, Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import cors from 'cors';
import path from "path";
import { WebhookNotifier } from "../sources/ingressNotifiers/WebhookNotifier.ts";
import ScrobbleSources from "../sources/ScrobbleSources.ts";
import { WebScrobblerSource } from "../sources/WebScrobblerSource.ts";
import { nonEmptyBody } from "./middleware.ts";

const corsOpts: cors.CorsOptions = {
    methods: ['POST']
}

export const setupWebscrobblerRoutes = (app: ExpressWithAsync, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

    const logger = childLogger(parentLogger, ['Ingress', 'WebScrobbler']);

    const webScrobblerJsonParser = bodyParser.json({
        type: ['text/*', 'application/json'],
        // verify: function(req, res, buf, encoding) {
        //     // get rawBody
        //     // @ts-ignore
        //     req.rawBody = buf.toString();
        // }
    });
    const webhookIngress = new WebhookNotifier(logger);
    app.options('/api/webscrobbler*', async (req, res, next) => {
        webhookIngress.trackIngress(req, true);
        next();
    },
        cors(corsOpts));

    app.postAsync('/api/webscrobbler*',
        async (req, res, next) => {
            webhookIngress.trackIngress(req, true);
            next();
        },
        cors(corsOpts),
        webScrobblerJsonParser, nonEmptyBody(logger, 'WebScrobbler Extension'), async (req, res) => {
            webhookIngress.trackIngress(req, false);

            res.sendStatus(200);

            const parts = path.parse(req.path);
            const slug = parts.name === 'webscrobbler' ? undefined : parts.name;

            // let cleanPath = req.path;
            // if (cleanPath.charAt(cleanPath.length - 1) === '/') {
            //     cleanPath = cleanPath.slice(0, -1);
            // }
            // const splitPath = cleanPath.split('/');
            // const slug = splitPath[splitPath.length - 1];

            const playerState = WebScrobblerSource.playStateFromRequest(req.body);

            const sources = scrobbleSources.getByType('webscrobbler') as WebScrobblerSource[];
            if (sources.length === 0) {
                logger.warn('Received WebScrobbler payload but no WebScrobbler sources are configured');
            }

            let slugMatched = false;
            for (const source of sources) {
                if (source.matchSlug(slug)) {
                    await source.handle(playerState);
                    slugMatched = true;
                }
            }

            if (!slugMatched) {
                if (slug === undefined) {
                    logger.warn(`Request URL did not have a slug and no WebScrobbler source was configured without a slug.`);
                } else {
                    logger.warn(`No WebScrobbler souce had the given slug '${slug}'`);
                }
            }
        });
}

