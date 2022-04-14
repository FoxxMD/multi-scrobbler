import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';
import compareVersions from 'compare-versions';
import {
    buildTrackString,
    playObjDataMatch,
    setIntersection,
    sleep,
    sortByPlayDate,
    truncateStringToLength,
    parseRetryAfterSecsFromObj
} from "../utils.js";

const feat = ["ft.", "ft", "feat.", "feat", "featuring", "Ft.", "Ft", "Feat.", "Feat", "Featuring"];

export default class MalojaScrobbler extends AbstractScrobbleClient {

    requiresAuth = true;
    ready = false;
    serverVersion;

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

    static formatPlayObj(obj, serverVersion = undefined) {
        let artists,
            title,
            album,
            duration,
            time;

        if(serverVersion === undefined || compareVersions(serverVersion, '3.0.0') >= 0) {
            // scrobble data structure changed for v3
            const {
                // when the track was scrobbled
                time: mTime,
                track: {
                    artists: mArtists,
                    title: mTitle,
                    album: {
                        name: mAlbum,
                        artists: albumArtists
                    } = {},
                    // length of the track
                    length: mLength,
                } = {},
                // how long the track was listened to before it was scrobbled
                duration: mDuration,
            } = obj;
            artists = mArtists;
            time = mTime;
            title = mTitle;
            duration = mDuration;
            album = mAlbum;
        } else {
            // scrobble data structure for v2 and below
            const {
                artists: mArtists,
                title: mTitle,
                album: mAlbum,
                duration: mDuration,
                time: mTime,
            } = obj;
            artists = mArtists;
            title = mTitle;
            album = mAlbum;
            duration = mDuration;
            time = mTime;
        }
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

    formatPlayObj = obj => MalojaScrobbler.formatPlayObj(obj, this.serverVersion);

    callApi = async (req, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = 1.5
        } = this.config;

        try {
            return await req;
        } catch (e) {
            if(retries < maxRequestRetries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return await this.callApi(req, retries + 1)
            }
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

        const {url} = this.config;
        try {
            const serverInfoResp = await this.callApi(request.get(`${url}/apis/mlj_1/serverinfo`));
            const {
                statusCode,
                body: {
                    version = [],
                    versionstring = '',
                } = {},
            } = serverInfoResp;

            if (statusCode >= 300) {
                this.logger.info(`Communication test not OK! HTTP Status => Expected: 200 | Received: ${statusCode}`);
                return false;
            }

            this.logger.info('Communication test succeeded.');

            if (version.length === 0) {
                this.logger.warn('Server did not respond with a version. Either the base URL is incorrect or this Maloja server is too old. multi-scrobbler will most likely not work with this server.');
            } else {
                this.logger.info(`Maloja Server Version: ${versionstring}`);
                this.serverVersion = versionstring;
                if(compareVersions(versionstring, '2.7.0') < 0) {
                    this.logger.warn('Maloja Server Version is less than 2.7, please upgrade to ensure compatibility');
                }
            }
            return true;
        } catch (e) {
            this.logger.error('Communication test failed');
            this.logger.error(e);
            return false;
        }
    }

    testHealth = async () => {

        const {url} = this.config;
        try {
            const serverInfoResp = await this.callApi(request.get(`${url}/apis/mlj_1/serverinfo`), {maxRequestRetries: 0});
            const {
                statusCode,
                body: {
                    db_status: {
                        healthy = false,
                        rebuildinprogress = false,
                        complete = false,
                    }
                } = {},
            } = serverInfoResp;

            if (statusCode >= 300) {
                return [false, `Server responded with NOT OK status: ${statusCode}`];
            }

            if(rebuildinprogress) {
                return [false, 'Server is rebuilding database'];
            }

            if(!healthy) {
                return [false, 'Server responded that it is not healthy'];
            }

            return [true];
        } catch (e) {
            this.logger.error('Unexpected error encountered while testing server health');
            this.logger.error(e);
            throw e;
        }
    }

    initialize = async () => {
        // just checking that we can get a connection
        this.initialized = await this.testConnection();
        return this.initialized;
    }

    testAuth = async () => {

        const {url, apiKey} = this.config;
        try {
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
                this.logger.info('Auth test passed!');
                this.authed = true;
            } else {
                this.authed = false;
                this.logger.error('Testing connection failed => Server Response body was malformed -- should have returned "status: ok"...is the URL correct?', {
                    status,
                    body,
                    text: text.slice(0, 50)
                });
            }
        } catch (e) {
            if(e.status === 403) {
                // may be an older version that doesn't support auth readiness before db upgrade
                // and if it was before api was accessible during db build then test would fail during testConnection()
                if(compareVersions(this.serverVersion, '2.12.19') < 0) {
                    if(!(await this.isReady())) {
                        this.logger.error(`Could not test auth because server is not ready`);
                        this.authed = false;
                        return this.authed;
                    }
                }
            }
            this.logger.error('Auth test failed');
            this.logger.error(e);
            this.authed = false;
        }
        return this.authed;
    }

    isReady = async () => {
        if (this.ready) {
            return this.ready;
        }

        try {
            const [isHealthy, status] = await this.testHealth();
            if (!isHealthy) {
                this.logger.error(`Server is not ready: ${status}`);
                this.ready = false;
                return this.ready;
            }
            this.logger.info('Server reported database is built and status is healthy');
            this.ready = true;
            return this.ready;
        } catch (e) {
            this.logger.error(`Testing server health failed due to an unexpected error`);
            this.ready = false;
            return this.ready;
        }
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const {url} = this.config;
            const resp = await this.callApi(request.get(`${url}/apis/mlj_1/scrobbles?max=20`));
            const {
                body: {
                    list = [],
                } = {},
            } = resp;
            this.recentScrobbles = list.map(x => this.formatPlayObj(x)).sort(sortByPlayDate);
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
        const tr = truncateStringToLength(27);
        const scoreTrackOpts = {include: ['track', 'time'], transformers: {track: t => tr(t).padEnd(30)}};

        // return early if we don't care about checking existing
        if (false === this.checkExistingScrobbles) {
            if (this.verboseOptions.match.onNoMatch) {
                this.logger.debug(`(Existing Check) Source: ${buildTrackString(playObj, scoreTrackOpts)} => No Match because existing scrobble check is FALSE`);
            }
            return undefined;
        }

        let existingScrobble;
        let closestMatch = {score: 0, breakdowns: ['None']};

        // then check if we have already recorded this
        const [existingExactSubmitted, existingDataSubmitted = []] = this.findExistingSubmittedPlayObj(playObj);

        // if we have an submitted play with matching data and play date then we can just return the response from the original scrobble
        if (existingExactSubmitted !== undefined) {
            existingScrobble = existingExactSubmitted.scrobble;

            closestMatch = {
                score: 1,
                breakdowns: ['Exact Match found in previously successfully scrobbled']
            }
        }
        // if not though then we need to check recent scrobbles from scrobble api.
        // this will be less accurate than checking existing submitted (obv) but will happen if backlogging or on a fresh server start

        // if no recent scrobbles found then assume we haven't submitted it
        // (either user doesnt want to check history or there is no history to check!)
        if (this.recentScrobbles.length === 0) {
            if (this.verboseOptions.match.onNoMatch) {
                this.logger.debug(`(Existing Check) ${buildTrackString(playObj, scoreTrackOpts)} => No Match because no recent scrobbles returned from API`);
            }
            return undefined;
        }

        if (existingScrobble === undefined) {

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
                    source,
                } = {},
            } = playObj;

            // clean source title so it matches title from the scrobble api response as closely as we can get it
            let cleanSourceTitle = this.cleanSourceSearchTitle(playObj);

            existingScrobble = this.recentScrobbles.find((x) => {

                const referenceMatch = referenceApiScrobbleResponse !== undefined && playObjDataMatch(x, referenceApiScrobbleResponse);

                const {data: {playDate: scrobbleTime, track: scrobbleTitle, artists = []} = {}} = x;

                const playDiffThreshold = source === 'Subsonic' ? 60 : 10;
                let closeTime = false;
                // check if scrobble time is same as play date (when the track finished playing AKA entered recent tracks)
                let scrobblePlayDiff = Math.abs(playDate.unix() - scrobbleTime.unix());
                let scrobblePlayStartDiff;
                if (scrobblePlayDiff <= playDiffThreshold) {
                    //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (finish time) vs. scrobble time diff was smaller than 10 seconds`);
                    closeTime = true;
                }
                // also need to check that scrobble time isn't the BEGINNING of the track -- if the source supports durations
                if (closeTime === false && trackLength !== undefined) {
                    scrobblePlayStartDiff = Math.abs(playDate.unix() - (scrobbleTime.unix() - trackLength));
                    if (scrobblePlayStartDiff <= playDiffThreshold) {
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
                    `Time: ${closeTime ? 1 : 0} * .5 = ${timeScore.toFixed(2)}`,
                    `Score ${score.toFixed(2)} => ${score >= .7 ? 'Matched!' : 'No Match'}`
                ];

                const confidence = `Score ${score.toFixed(2)} => ${score >= .7 ? 'Matched!' : 'No Match'}`

                const scoreInfo = {
                    score,
                    scrobble: x,
                    breakdowns: this.verboseOptions.match.confidenceBreakdown ? scoreBreakdowns : [confidence]
                }

                if (closestMatch.score <= score && score > 0) {
                    closestMatch = scoreInfo
                }

                return score >= .7;
            });
        }

        if ((existingScrobble !== undefined && this.verboseOptions.match.onMatch) || (existingScrobble === undefined && this.verboseOptions.match.onNoMatch)) {
            const closestScrobble = closestMatch.scrobble === undefined ? closestMatch.breakdowns.join(' | ') : `Closest Scrobble: ${buildTrackString(closestMatch.scrobble, scoreTrackOpts)} => ${closestMatch.breakdowns.join(' | ')}`;
            this.logger.debug(`(Existing Check) Source: ${buildTrackString(playObj, scoreTrackOpts)} => ${closestScrobble}`);
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

            let scrobbleResponse = {};

            if(this.serverVersion === undefined || compareVersions(this.serverVersion, '3.0.0') >= 0) {
                const {
                    body: {
                    track,
                } = {}
                } = response;
                scrobbleResponse = {
                    time: playDate.unix(),
                    track: {
                        ...track,
                        length: duration
                    },
                }
                if(album !== undefined) {
                    const {
                        album: malojaAlbum = {},
                    } = track;
                    scrobbleResponse.track.album = {
                        ...malojaAlbum,
                        name: album
                    }
                }
            } else {
                const {body: {
                    track: {
                        time: mTime = playDate.unix(),
                        duration: mDuration = duration,
                        album: mAlbum = album,
                        ...rest
                    }
                } = {}} = response;
                scrobbleResponse = {...rest, album: mAlbum, time: mTime, duration: mDuration};
            }
            this.addScrobbledTrack(playObj, scrobbleResponse);
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
