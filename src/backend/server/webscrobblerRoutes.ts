import type {Express, Request} from 'express';
import { childLogger, type Logger } from "@foxxmd/logging";
import bodyParser from "body-parser";
import cors from 'cors';
import path from "path";
import { WebhookNotifier } from "../sources/ingressNotifiers/WebhookNotifier.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import { WebScrobblerSource } from "../sources/WebScrobblerSource.ts";
import { ingressGate, nonEmptyBody } from "./middleware.ts";
import type { createTypedRouter, TypedMiddleware } from "@minisylar/express-typed-router";
import { webScrobblePayloadSchema, type WebScrobblerPayload } from '../common/vendor/webscrobbler/interfaces.ts';

const corsOpts: cors.CorsOptions = {
    methods: ['POST']
}

const slugFromRequest = (req: Request) => {
    const parts = path.parse(req.path);
    return parts.name === 'webscrobbler' ? undefined : parts.name;
}

export const setupWebscrobblerRoutes = (app: Express, router: ReturnType<typeof createTypedRouter>, parentLogger: Logger, scrobbleSources: ScrobbleSources) => {

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
    const getSources = () => scrobbleSources.getByType('webscrobbler') as WebScrobblerSource[];

    const gate = ingressGate({
        label: 'WebScrobbler',
        logger,
        getSources,
        match: (source, req) => source.matchSlug(slugFromRequest(req)),
        describe: (req) => `Slug: ${slugFromRequest(req) ?? '(no slug)'}`,
        track: (req) => webhookIngress.trackIngress(req, true),
    });
    app.options('/api/webscrobbler*path', gate, cors(corsOpts));

    router.post('/api/webscrobbler{*splat}',
        {
            docs: {operationId: 'accepts-a-webscrobbler-native-scrobble'},
            // cors before gate so a browser extension can read the 409
            middleware: [cors(corsOpts) as TypedMiddleware,gate,webScrobblerJsonParser,nonEmptyBody(logger, 'WebScrobbler Extension')],
            bodySchema: webScrobblePayloadSchema,
            tags: ['WebScrobbler Ingress'],
            pathExample: '/api/webscrobbler',
            summary: 'Accepts a Webscrobbler native scrobble',
            description: 'Use the default path `/api/webscrobbler` for standard configs or append a suffix if using a slug EX `/api/webscrobbler/mySlug`'
        },
        async (req, res) => {
            await webhookIngress.trackIngress(req as Request, false);

            res.sendStatus(200);

            const slug = slugFromRequest(req as Request);

            // let cleanPath = req.path;
            // if (cleanPath.charAt(cleanPath.length - 1) === '/') {
            //     cleanPath = cleanPath.slice(0, -1);
            // }
            // const splitPath = cleanPath.split('/');
            // const slug = splitPath[splitPath.length - 1];

            const playerState = WebScrobblerSource.playStateFromRequest(req.body as unknown as WebScrobblerPayload);

            // gate middleware already rejected requests that no Source matches
            for (const source of getSources()) {
                if (source.matchSlug(slug)) {
                    await source.handle(playerState);
                }
            }
        });
}

