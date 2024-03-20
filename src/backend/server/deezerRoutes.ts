import { ExpressHandler } from "../common/infrastructure/Atomic.js";
import { mergeArr, parseBool, sleep } from "../utils.js";
import {ExpressWithAsync} from "@awaitjs/express";
import {Logger} from "@foxxmd/logging";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import PlexSource, { plexRequestMiddle } from "../sources/PlexSource.js";
import { PlexNotifier } from "../sources/ingressNotifiers/PlexNotifier.js";
import DeezerSource from "../sources/DeezerSource.js";
import passport from "passport";

export const setupDeezerRoutes = (app: ExpressWithAsync, logger: Logger, scrobbleSources: ScrobbleSources) => {

    // initialize deezer strategies
    // const deezerSources = scrobbleSources.getByType('deezer') as DeezerSource[];
    // for(const d of deezerSources) {
    //     passport.use(`deezer-${d.name}`, d.generatePassportStrategy());
    // }

    // something about the deezer passport strategy makes express continue with the response even though it should wait for accesstoken callback and userprofile fetching
    // so to get around this add an additional middleware that loops/sleeps until we should have fetched everything ¯\_(ツ)_/¯
    app.getAsync(/.*deezer\/callback*$/, (req, res, next) => {
        if(req.url.indexOf('/api') !== 0) {
            return res.redirect(307, `/api${req.url}`);
        }
        // @ts-expect-error TS(2339): Property 'deezerSource' does not exist on type 'Se... Remove this comment to see the full error message
        const entity = scrobbleSources.getByName(req.session.deezerSource as string);
        const passportFunc = passport.authenticate(`deezer-${entity.name}`, {session: false});
        return passportFunc(req, res, next);
    }, async (req, res) => {
        // @ts-expect-error TS(2339): Property 'deezerSource' does not exist on type 'Se... Remove this comment to see the full error message
        const entity = scrobbleSources.getByName(req.session.deezerSource as string) as DeezerSource;
        for(let i = 0; i < 3; i++) {
            if(entity.error !== undefined) {
                return res.send('Error with deezer credentials storage');
            } else if(entity.config.data.accessToken !== undefined) {
                // start polling
                await entity.doAuthentication();
                entity.poll()
                return res.redirect('/');
            } else {
                await sleep(1500);
            }
        }
        res.send('Waited too long for credentials to store. Try restarting polling.');
    });
}

