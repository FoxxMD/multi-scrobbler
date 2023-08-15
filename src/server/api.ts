import {ExpressWithAsync} from "@awaitjs/express";
import {getRoot} from "../ioc.js";
import {capitalize} from "../utils.js";
import {makeClientCheckMiddle, makeSourceCheckMiddle} from "./middleware.js";
import AbstractSource from "../sources/AbstractSource.js";
import {ClientStatusData, PlayObject, SourceStatusData, TrackStringOptions} from "../common/infrastructure/Atomic.js";
import {buildTrackString, longestString, truncateStringToLength} from "../utils/StringUtils.js";



export const setupApi = (app: ExpressWithAsync) => {
    const root = getRoot();

    const scrobbleSources = root.get('sources');
    const scrobbleClients = root.get('clients');

    const clientCheckMiddle = makeClientCheckMiddle(scrobbleClients);
    const sourceCheckMiddle = makeSourceCheckMiddle(scrobbleSources);

    app.getAsync('/api/status', async (req, res, next) => {

        const sourceData = scrobbleSources.sources.map((x) => {
            const {
                type,
                tracksDiscovered = 0,
                name,
                canPoll = false,
                polling = false,
                initialized = false,
                requiresAuth = false,
                requiresAuthInteraction = false,
                authed = false,
            } = x;
            const base: SourceStatusData = {
                status: '',
                type,
                display: capitalize(type),
                tracksDiscovered,
                name,
                canPoll,
                hasAuth: requiresAuth,
                hasAuthInteraction: requiresAuthInteraction,
                authed,
            };
            if (!initialized) {
                base.status = 'Not Initialized';
            } else if (requiresAuth && !authed) {
                base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
            } else if (canPoll) {
                base.status = polling ? 'Running' : 'Idle';
            } else {
                base.status = tracksDiscovered > 0 ? 'Received Data' : 'Awaiting Data'
            }
            return base;
        });

        const clientData = scrobbleClients.clients.map((x) => {
            const {
                type,
                tracksScrobbled = 0,
                name,
                initialized = false,
                requiresAuth = false,
                requiresAuthInteraction = false,
                authed = false,
            } = x;
            const base: ClientStatusData = {
                status: '',
                type,
                display: capitalize(type),
                tracksDiscovered: tracksScrobbled,
                name,
                hasAuth: requiresAuth,
            };
            if (!initialized) {
                base.status = 'Not Initialized';
            } else if (requiresAuth && !authed) {
                base.status = requiresAuthInteraction ? 'Auth Interaction Required' : 'Authentication Failed Or Not Attempted'
            } else {
                base.status = tracksScrobbled > 0 ? 'Received Data' : 'Awaiting Data';
            }
            return base;
        });
        return res.json({sources: sourceData, clients: clientData});
    });

    app.getAsync('/api/recent', sourceCheckMiddle, async (req, res, next) => {
        const {
            // @ts-expect-error TS(2339): Property 'scrobbleSource' does not exist on type '... Remove this comment to see the full error message
            scrobbleSource: source,
        } = req;
        if (!source.canPoll) {
            return res.status(400).send(`Specified source cannot retrieve recent plays (${source.type})`);
        }

        const result = (source as AbstractSource).getFlatRecentlyDiscoveredPlays();
        const artistTruncFunc = truncateStringToLength(Math.min(40, longestString(result.map((x: any) => x.data.artists.join(' / ')).flat())));
        const trackLength = longestString(result.map((x: any) => x.data.track))
        const plays = result.map((x: PlayObject) => {
            const {
                meta: {
                    url: {
                        web
                    } = {}
                } = {}
            } = x;
            const buildOpts: TrackStringOptions = {
                include: ['time', 'timeFromNow', 'track', 'artist'],
                transformers: {
                    artists: (a: any) => artistTruncFunc(a.join(' / ')).padEnd(33),
                    track: (t: any) => t.padEnd(trackLength)
                }
            }
            if (web !== undefined) {
                buildOpts.transformers.track = t => `<a href="${web}">${t}</a>${''.padEnd(Math.max(trackLength - t.length, 0))}`;
            }
            return buildTrackString(x, buildOpts);
        });
        return res.json(result);
    });
}
