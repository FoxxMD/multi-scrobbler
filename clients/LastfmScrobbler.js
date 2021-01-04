import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import dayjs from 'dayjs';
import LastFm from 'lastfm-node-client';
import {
    buildTrackString,
    playObjDataMatch,
    readJson,
    setIntersection, sleep,
    sortByPlayDate,
    truncateStringToLength, writeFile
} from "../utils.js";

const badErrors = [
    'api key suspended',
    'invalid session key',
    'invalid api key',
    'authentication failed'
];

const retryErrors = [
    'operation failed',
    'service offline',
    'temporarily unavailable',
    'rate limit'
]

export default class LastfmScrobbler extends AbstractScrobbleClient {

    client;
    redirectUri;
    workingCredsPath;
    initialized = false;
    user;

    constructor(name, config = {}, options = {}) {
        super('lastfm', name, config, options);
        const {redirectUri, apiKey, secret, session, configDir} = config;
        this.redirectUri = `${redirectUri}?state=${name}`;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config! Client will most likely fail when trying to scrobble");
        }
        this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;
        this.client = new LastFm(apiKey, secret, session);
    }

    static formatPlayObj(obj) {
        const {
            artist: {
                '#text': artists
            },
            name: title,
            album: {
                '#text': album,
            },
            duration,
            date: {
                uts: time,
            },
        } = obj;
        let artistStrings = artists.split(',');
        return {
            data: {
                artists: [...new Set(artistStrings)],
                track: title,
                album,
                duration,
                playDate: dayjs.unix(time),
            },
            meta: {
                source: 'Lastfm',
            }
        }
    }

    formatPlayObj = obj => LastfmScrobbler.formatPlayObj(obj);

    callApi = async (func, tries = 1) => {
        try {
            return await func(this.client);
        } catch (e) {
            const {
                message,
            } = e;
            // for now check for exceptional errors by matching error code text
            const retryError = retryErrors.find(x => message.include(x));
            if(undefined !== retryError) {
                if(tries <= 2) {
                    const delay = tries * 3;
                    this.logger.warn(`API call was not good but recoverable (${retryError}), retrying in ${delay} seconds...`);
                    await sleep(delay * 1000);
                    return this.callApi(func, tries + 1);
                } else {
                    this.logger.warn('Could not recover!');
                    throw e;
                }
            }

            throw e;
        }
    }

    getAuthUrl = () => {
        const redir = `${this.config.redirectUri}?state=${this.name}`;
        return `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(redir)}`
    }

    authenticate = async (token) => {
        const sessionRes = await this.client.authGetSession({token});
        const {
            session: {
                key: sessionKey,
                name, // username
            } = {}
        } = sessionRes;
        this.client.sessionKey = sessionKey;

        await writeFile(this.workingCredsPath, JSON.stringify({
            sessionKey,
        }));
    }

    initialize = async () => {

        try {
            const creds = await readJson(this.workingCredsPath, {throwOnNotFound: false});
            const {sessionKey} = creds || {};
            if (this.client.sessionKey === undefined && sessionKey !== undefined) {
                this.client.sessionKey = sessionKey;
            }
        } catch (e) {
            this.logger.warn('Current lastfm credentials file exists but could not be parsed', {path: this.workingCredsPath});
        }

        if (this.client.sessionKey === undefined) {
            this.logger.info('No session key found. User interaction for authentication required.');
            return;
        }
        try {
            const infoResp = await this.callApi(client => client.userGetInfo());
            const {
                user: {
                    name,
                } = {}
            } = infoResp;
            this.user = name;
            this.initialized = true;
            this.logger.info(`Client authorized for user ${name}`)
            return true;
        } catch (e) {
            this.logger.error('Testing connection failed');
            return false;
        }
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const resp = await this.callApi(client => client.userGetRecentTracks({user: this.user, limit: 20}));
            const {
                recenttracks: {
                    track: list = [],
                }
            } = resp;
            this.recentScrobbles = list.map(x => LastfmScrobbler.formatPlayObj(x)).sort(sortByPlayDate);
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
            } = {},
        } = playObj;
        return track.toLocaleLowerCase().trim();
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
        const {
            data: {
                artists,
                album,
                track,
                duration,
                playDate
            } = {},
            data = {},
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const sType = newFromSource ? 'New' : 'Backlog';

        try {
            const response = await this.callApi(client => client.trackScrobble(
                {
                    artist: artists.join(', '),
                    duration,
                    track,
                    album,
                    timestamp: playDate.unix(),
                }));
            const {
                scrobbles: {
                    '@attr': {
                        accepted = 0,
                        ignored = 0,
                        code,
                    },
                    scrobble: {
                        track: {
                           '#text': trackName,
                        } = {},
                        timestamp,
                        ignoredMessage: {
                            code: ignoreCode,
                            '#text': ignoreMsg,
                        } = {},
                        ...rest
                    } = {}
                } = {},
            } = response;
            if(code === 5) {
                this.initialized = false;
                throw new Error('Service reported daily scrobble limit exceeded! 😬 Disabling client');
            }
            this.addScrobbledTrack(playObj, {...rest, date: { uts: timestamp}, name: trackName});
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            if(ignoreMsg !== '') {
                this.logger.warn(`Service ignored this scrobble 😬 => (Code ${ignoreCode}) ${ignoreMsg}`)
            }
            // last fm has rate limits but i can't find a specific example of what that limit is. going to default to 1 scrobble/sec to be safe
            await sleep(1000);
        } catch (e) {
            this.logger.error(`Scrobble Error (${sType})`, {playInfo: buildTrackString(playObj)});
            throw e;
        }

        return true;
    }
}
