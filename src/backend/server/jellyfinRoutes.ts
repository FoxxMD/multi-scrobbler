import { parseBool, remoteHostIdentifiers } from "../utils.js";
import {ExpressWithAsync} from "@awaitjs/express";
import {Logger} from "@foxxmd/winston";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import bodyParser from "body-parser";
import { JellyfinNotifier } from "../sources/ingressNotifiers/JellyfinNotifier.js";
import JellyfinSource from "../sources/JellyfinSource.js";

export const setupJellyfinRoutes = (app: ExpressWithAsync, logger: Logger, scrobbleSources: ScrobbleSources) => {

    // webhook plugin sends json with context type text/utf-8 so we need to parse it differently
    const jellyfinJsonParser = bodyParser.json({
        type: ['text/*', 'application/json'],
        // verify: function(req, res, buf, encoding) {
        //     // get rawBody
        //     // @ts-ignore
        //     req.rawBody = buf.toString();
        // }
    });
    const jellyIngress = new JellyfinNotifier();
    app.postAsync('/jellyfin', async (req, res) => {
        res.redirect(307, '/api/jellyfin/ingress');
    });
    app.postAsync('/api/jellyfin/ingress',
        async (req, res, next) => {
            // track request before parsing body to ensure we at least log that something is happening
            // (in the event body parsing does not work or request is not POST/PATCH)
            jellyIngress.trackIngress(req, true);
            next();
        },
        jellyfinJsonParser, async (req, res) => {
            jellyIngress.trackIngress(req, false);

            res.send('OK');

            const bodyEmpty = req.body === undefined || req.body === null || (typeof req.body === 'object' && Object.keys(req.body).length === 0);
            if(bodyEmpty) {
                const length = req.header('content-length') !== undefined ? Number.parseInt(req.header('content-length')) : undefined;
                // can't think of a way a user would send an empty body for a webhook payload but if they meant to do it don't spam them with errors...
                if(length === 0) {
                    return;
                }
                if(length === undefined) {
                    logger.warn(`Jellyfin is not sending a well-formatted request. It does not have valid headers (application/json - text/*) OR it is missing content-length header: Content-Type => '${req.header('content-type')}' | Length => ${length}`);
                } else {
                    logger.warn(`Jellyfin is not sending a request with valid headers. Content-Type must be either application/json or a text/* wildcard (like text/plain) -- given: Content-Type => '${req.header('content-type')}'`);
                }
                res.status(400).send('Invalid Content-Type. Must be either application/json or a text wildcard (like text/plain)');
                return;
            }

            const parts = remoteHostIdentifiers(req);
            const connectionId = `${parts.host}-${parts.proxy ?? ''}`;

            const playObj = JellyfinSource.formatPlayObj({...req.body, connectionId}, {newFromSource: true});
            const pSources = scrobbleSources.getByType('jellyfin') as JellyfinSource[];
            if(pSources.length === 0) {
                logger.warn('Received Jellyfin connection but no Jellyfin sources are configured');
            }
            const logPayload = pSources.some(x => {
                const {
                    options: {
                        logPayload = parseBool(process.env.DEBUG_MODE)
                    } = {}
                } = x.config;
                return logPayload;
            });
            if(logPayload) {
                logger.debug(`[Jellyfin] Logging payload due to at least one Jellyfin source having 'logPayload: true`, req.body);
            }
            for (const source of pSources) {
                await source.handle(playObj);
            }
        });
}

