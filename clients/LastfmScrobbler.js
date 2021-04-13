import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import dayjs from 'dayjs';

import {
    buildTrackString,
    playObjDataMatch,
    setIntersection, sleep,
    sortByPlayDate,
    truncateStringToLength,
} from "../utils.js";
import LastfmApiClient from "../apis/LastfmApiClient.js";

export default class LastfmScrobbler extends AbstractScrobbleClient {

    api;
    initialized = false;

    constructor(name, config = {}, options = {}) {
        super('lastfm', name, config, options);
        this.api = new LastfmApiClient(name, config, options)
    }

    formatPlayObj = obj => LastfmApiClient.formatPlayObj(obj);

    initialize = async () => {
        this.initialized = await this.api.initialize();
        return this.initialized;
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const resp = await this.api.callApi(client => client.userGetRecentTracks({user: this.api.user, limit: 20, extended: true}));
            const {
                recenttracks: {
                    track: list = [],
                }
            } = resp;
            this.recentScrobbles = list.reduce((acc, x) => {
                try {
                    const formatted = LastfmApiClient.formatPlayObj(x);
                    const {
                        data: {
                            track,
                            playDate,
                        },
                        meta: {
                            mbid,
                            nowPlaying,
                        }
                    } = formatted;
                    if(nowPlaying === true) {
                        // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
                        // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
                        // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
                        this.logger.debug("Ignoring 'now playing' track returned from Last.fm client", {track, mbid});
                        return acc;
                    } else if(playDate === undefined) {
                        this.logger.warn(`Last.fm recently scrobbled track did not contain a timestamp, omitting from time frame check`, {track, mbid});
                        return acc;
                    }
                    return acc.concat(formatted);
                } catch (e) {
                    this.logger.warn('Failed to format Last.fm recently scrobbled track, omitting from time frame check', {error: e.message});
                    this.logger.debug('Full api response object:');
                    this.logger.debug(x);
                    return acc;
                }
            }, []).sort(sortByPlayDate);
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
            const response = await this.api.callApi(client => client.trackScrobble(
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
