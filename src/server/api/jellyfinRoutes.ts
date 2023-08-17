import {parseBool, remoteHostIdentifiers} from "../utils.js";
import {ExpressWithAsync} from "@awaitjs/express";
import {Logger} from "@foxxmd/winston";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import bodyParser from "body-parser";
import {JellyfinNotifier} from "../sources/ingressNotifiers/JellyfinNotifier.js";
import JellyfinSource from "../sources/JellyfinSource.js";

export const setupJellyfinRoutes = (app: ExpressWithAsync, logger: Logger, scrobbleSources: ScrobbleSources) => {

    // webhook plugin sends json with context type text/utf-8 so we need to parse it differently
    const jellyfinJsonParser = bodyParser.json({type: 'text/*'});
    const jellyIngress = new JellyfinNotifier();
    app.postAsync('/jellyfin', async function(req, res)  {
        res.redirect(307, 'api/jellyfin/ingress');
    });
    app.postAsync('/api/jellyfin/ingress',
        async function (req, res, next) {
            // track request before parsing body to ensure we at least log that something is happening
            // (in the event body parsing does not work or request is not POST/PATCH)
            jellyIngress.trackIngress(req, true);
            next();
        },
        jellyfinJsonParser, async function (req, res) {
            jellyIngress.trackIngress(req, false);

            res.send('OK');

            const parts = remoteHostIdentifiers(req);
            const connectionId = `${parts.host}-${parts.proxy ?? ''}`;

            const playObj = JellyfinSource.formatPlayObj({...req.body, connectionId}, {newFromSource: true});
            const pSources = scrobbleSources.getByType('jellyfin') as JellyfinSource[];
            if(pSources.length === 0) {
                logger.warn('Received Jellyfin connection but no Jellyfin sources are configured');
            }
            const logPayload = pSources.some(x => {
                const {
                    data: {
                    } = {},
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

