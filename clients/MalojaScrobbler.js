import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';
import {buildTrackString, playObjDataMatch, setIntersection, sortByPlayDate, truncateStringToLength} from "../utils.js";

const feat = ["ft.", "ft", "feat.", "feat", "featuring", "Ft.", "Ft", "Feat.", "Feat", "Featuring"];

export default class MalojaScrobbler extends AbstractScrobbleClient {

    constructor(name, config = {}, options = {}) {
        super('maloja', name, config, options);
        const {url, apiKey} = config;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config! Client will most likely fail when trying to scrobble");
        }
        if (url === undefined) {
            throw new Error("Missing 'url' for Maloja config");
        }
    }

    static formatPlayObj(obj) {
        const {
            artists,
            title,
            album,
            duration,
            time,
        } = obj;
        let artistStrings = artists.reduce((acc, curr) => {
            let aString;
            if (typeof curr === 'string') {
                aString = curr;
            } else if (typeof curr === 'object') {
                aString = curr.name;
            }
            const aStrings = aString.split(',');
            return [...acc, ...aStrings];
        }, []);
        return {
            data: {
                artists: [...new Set(artistStrings)],
                track: title,
                album,
                duration,
                playDate: dayjs.unix(time),
            },
            meta: {
                source: 'Maloja',
            }
        }
    }

    formatPlayObj = obj => MalojaScrobbler.formatPlayObj(obj);

    callApi = async (req) => {
        try {
            return await req;
        } catch (e) {
            const {
                message,
                response: {
                    status,
                    body,
                    text,
                } = {},
                response,
            } = e;
            let msg = response !== undefined ? `API Call failed: Server Response => ${message}` : `API Call failed: ${message}`;
            const responseMeta = body ?? text;
            this.logger.error(msg, {status, response: responseMeta});
            throw e;
        }
    }

    testConnection = async () => {

        const {url, apiKey} = this.config;
        try {
            const serverInfoResp = await this.callApi(request.get(`${url}/apis/mlj_1/serverinfo`));
            const {
                body: {
                    version = [],
                    versionstring = '',
                } = {},
            } = serverInfoResp;
            if (version.length === 0) {
                this.logger.error('Server did not respond with a version. Either the base URL is incorrect or this Maloja server is too old :(');
                return false;
            }
            this.logger.info(`Maloja Server Version: ${versionstring}`);
            if (version[0] < 2 || version[1] < 7) {
                this.logger.warn('Maloja Server Version is less than 2.7, please upgrade to ensure compatibility');
            }

            const resp = await this.callApi(request
                .get(`${url}/apis/mlj_1/test`)
                .query({key: apiKey}));

            const {
                status,
                body: {
                    status: bodyStatus,
                } = {},
                body = {},
                text = '',
            } = resp;
            if (bodyStatus.toLocaleLowerCase() === 'ok') {
                this.logger.info('Test connection succeeded!');
                return true;
            }
            this.logger.error('Testing connection failed => Server Response body was malformed -- should have returned "status: ok"...is the URL correct?', {
                status,
                body,
                text: text.slice(0, 50)
            })
            return false;
        } catch (e) {
            this.logger.error('Testing connection failed');
            return false;
        }
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            const {url} = this.config;
            const resp = await this.callApi(request.get(`${url}/apis/mlj_1/scrobbles?max=20`));
            const {
                body: {
                    list = [],
                } = {},
            } = resp;
            this.recentScrobbles = list.map(x => MalojaScrobbler.formatPlayObj(x)).sort(sortByPlayDate);
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;

                this.scrobbledPlayObjs = this.scrobbledPlayObjs.filter(x => this.timeFrameIsValid(x.play));
            }
        }
        this.lastScrobbleCheck = dayjs();
    }

    cleanSourceSearchTitle = (playObj) => {
        const {
            data: {
                track,
                artists: sourceArtists = [],
            } = {},
        } = playObj;
        let lowerTitle = track.toLocaleLowerCase();
        lowerTitle = feat.reduce((acc, curr) => acc.replace(curr, ''), lowerTitle);
        // also remove [artist] from the track if found since that gets removed as well
        const lowerArtists = sourceArtists.map(x => x.toLocaleLowerCase());
        lowerTitle = lowerArtists.reduce((acc, curr) => acc.replace(curr, ''), lowerTitle);

        // remove any whitespace in parenthesis
        lowerTitle = lowerTitle.replace("\\s+(?=[^()]*\\))", '')
            // replace parenthesis
            .replace('()', '')
            .replace('( )', '')
            .trim();

        return lowerTitle;
    }

    alreadyScrobbled = (playObj, log = false) => {
        return this.existingScrobble(playObj, (log || this.verboseOptions.match.onMatch)) !== undefined;
    }

    existingScrobble = (playObj, logMatch = false) => {
        // return early if we don't care about checking existing
        if (false === this.checkExistingScrobbles) {
            return undefined;
        }

        // then check if we have already recorded this
        const [existingExactSubmitted, existingDataSubmitted = []] = this.findExistingSubmittedPlayObj(playObj);

        // if we have an submitted play with matching data and play date then we can just return the response from the original scrobble
        if (existingExactSubmitted !== undefined) {
            return existingExactSubmitted.scrobble;
        }
        // if not though then we need to check recent scrobbles from scrobble api.
        // this will be less accurate than checking existing submitted (obv) but will happen if backlogging or on a fresh server start

        // if no recent scrobbles found then assume we haven't submitted it
        // (either user doesnt want to check history or there is no history to check!)
        if (this.recentScrobbles.length === 0) {
            return undefined;
        }

        // we have have found an existing submission but without an exact date
        // in which case we can check the scrobble api response against recent scrobbles (also from api) for a more accurate comparison
        const referenceApiScrobbleResponse = existingDataSubmitted.length > 0 ? existingDataSubmitted[0].scrobble : undefined;

        const {
            data: {
                artists: sourceArtists = [],
                playDate
            } = {},
            meta: {
                trackLength,
            } = {},
        } = playObj;

        // clean source title so it matches title from the scrobble api response as closely as we can get it
        let cleanSourceTitle = this.cleanSourceSearchTitle(playObj);

        let closestMatch = {score: 0, str: ''};

        const tr = truncateStringToLength(27);

        const existingScrobble = this.recentScrobbles.find((x) => {

            const referenceMatch = referenceApiScrobbleResponse !== undefined && playObjDataMatch(x, referenceApiScrobbleResponse);

            const {data: {playDate: scrobbleTime, track: scrobbleTitle, artists = []} = {}} = x;

            let closeTime = false;
            // check if scrobble time is same as play date (when the track finished playing AKA entered recent tracks)
            let scrobblePlayDiff = Math.abs(playDate.unix() - scrobbleTime.unix());
            let scrobblePlayStartDiff;
            if (scrobblePlayDiff < 10) {
                //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (finish time) vs. scrobble time diff was smaller than 10 seconds`);
                closeTime = true;
            }
            // also need to check that scrobble time isn't the BEGINNING of the track -- if the source supports durations
            if (closeTime === false && trackLength !== undefined) {
                scrobblePlayStartDiff = Math.abs(playDate.unix() - (scrobbleTime.unix() - trackLength));
                if (scrobblePlayStartDiff < 10) {
                    //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (start time) vs. scrobble time diff was smaller than 10 seconds`);
                    closeTime = true;
                }
            }

            let titleMatch;
            const lowerScrobbleTitle = scrobbleTitle.toLocaleLowerCase().trim();
            // because of all this replacing we need a more position-agnostic way of comparing titles so use intersection on title split by spaces
            // and compare against length of scrobble title
            const sourceTitleTerms = new Set(cleanSourceTitle.split(' ').filter(x => x !== ''));
            const commonTerms = setIntersection(new Set(lowerScrobbleTitle.split(' ')), sourceTitleTerms);

            titleMatch = commonTerms.size / sourceTitleTerms.size;

            let artistMatch;
            const lowerSourceArtists = sourceArtists.map(x => x.toLocaleLowerCase());
            const lowerScrobbleArtists = artists.map(x => x.toLocaleLowerCase());
            artistMatch = setIntersection(new Set(lowerScrobbleArtists), new Set(lowerSourceArtists)).size / artists.length;

            const artistScore = .2 * artistMatch;
            const titleScore = .3 * titleMatch;
            const timeScore = .5 * (closeTime ? 1 : 0);
            const referenceScore = .5 * (referenceMatch ? 1 : 0);
            const score = artistScore + titleScore + timeScore;

            let scoreBreakdowns = [
                `Reference: ${(referenceMatch ? 1 : 0)} * .5 = ${referenceScore.toFixed(2)}`,
                `Artist ${artistMatch.toFixed(2)} * .2 = ${artistScore.toFixed(2)}`,
                `Title: ${titleMatch.toFixed(2)} * .3 = ${titleScore.toFixed(2)}`,
                `Time: ${closeTime ? 1 : 0} * .5 = ${timeScore}`,
                `Score ${score.toFixed(2)} => ${score >= .7 ? 'Matched!' : 'No Match'}`
            ];

            const confidence = `Score ${score.toFixed(2)} => ${score >= .7 ? 'Matched!' : 'No Match'}`

            const scoreInfo = {
                score,
                scrobble: x,
                breakdowns: this.verboseOptions.match.confidenceBreakdown ? scoreBreakdowns : [confidence]
            }

            if (closestMatch.score <= score) {
                closestMatch = scoreInfo
            }

            return score >= .7;
        });

        const scoreTrackOpts = {include: ['track', 'time'], transformers: {track: t => tr(t).padEnd(30)}};

        if((existingScrobble !== undefined && this.verboseOptions.match.onMatch) || (existingScrobble === undefined && this.verboseOptions.match.onNoMatch)) {
            this.logger.debug(`(Match Score) Source: ${buildTrackString(playObj, scoreTrackOpts)} <> Scrobble: ${buildTrackString(closestMatch.scrobble, scoreTrackOpts)} => ${closestMatch.breakdowns.join(' | ')}`);
        }
        return existingScrobble;
    }

    scrobble = async (playObj) => {
        const {url, apiKey} = this.config;

        const {
            data: {
                artists,
                album,
                track,
                duration,
                playDate
            } = {},
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const sType = newFromSource ? 'New' : 'Backlog';

        try {
            const response = await this.callApi(request.post(`${url}/apis/mlj_1/newscrobble`)
                .type('json')
                .send({
                    // maloja seems to detect this deliminator much better than commas
                    // also less likely artist has a forward slash in their name than a comma
                    artist: artists.join(' / '),
                    seconds: duration,
                    title: track,
                    album,
                    key: apiKey,
                    time: playDate.unix(),
                }));
            this.addScrobbledTrack(playObj, response.body.track);
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
        } catch (e) {
            this.logger.error(`Scrobble Error (${sType})`, {playInfo: buildTrackString(playObj)});
            throw e;
        }

        return true;
    }
}
