import { TautulliNotifier } from "../sources/ingressNotifiers/TautulliNotifier.js";
import { ExpressHandler } from "../common/infrastructure/Atomic.js";
import TautulliSource from "../sources/TautulliSource.js";
import { parseBool } from "../utils.js";
import {ExpressWithAsync} from "@awaitjs/express";
import {Logger} from "@foxxmd/logging";
import ScrobbleSources from "../sources/ScrobbleSources.js";

export const setupTautulliRoutes = (app: ExpressWithAsync, logger: Logger, scrobbleSources: ScrobbleSources) => {

    const tauIngress = new TautulliNotifier(logger);
    const tautulliIngressRoute: ExpressHandler = async function(this: any, req, res) {
        tauIngress.trackIngress(req, false);

        const payload = TautulliSource.formatPlayObj(req, {newFromSource: true});
        // try to get config name from payload
        if (req.body.scrobblerConfig !== undefined) {
            const source = scrobbleSources.getByName(req.body.scrobblerConfig);
            if (source !== undefined) {
                if (source.type !== 'tautulli') {
                    logger.warn(`Tautulli event specified a config name but the configured source was not a Tautulli type: ${req.body.scrobblerConfig}`);
                    return res.send('OK');
                } else {
                    if((source.config.options?.logPayload ?? parseBool(process.env.DEBUG_MODE)) === true) {
                        source.logger.debug(`Received Payload`, req.body);
                    }
                    // @ts-expect-error TS(2339): Property 'handle' does not exist on type 'never'.
                    await source.handle(payload);
                    return res.send('OK');
                }
            } else {
                logger.warn(`Tautulli event specified a config name but no configured source found: ${req.body.scrobblerConfig}`);
                return res.send('OK');
            }
        }
        // if none specified we'll iterate through all tautulli sources and hopefully the user has configured them with filters
        const tSources = scrobbleSources.getByType('tautulli');
        for (const source of tSources) {
            // @ts-expect-error TS(2339): Property 'handle' does not exist on type 'never'.
            await source.handle(payload);
        }

        res.send('OK');
    };

    app.postAsync('/tautulli', async (req, res) => {
        res.redirect(307, '/api/tautulli/ingress');
    });
    app.postAsync('/api/tautulli/ingress', tautulliIngressRoute);
}

